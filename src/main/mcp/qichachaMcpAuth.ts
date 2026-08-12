import crypto from 'crypto';
import { BrowserWindow } from 'electron';
import http from 'http';

const QICHACHA_ISSUER = 'https://agent.qcc.com';
const QICHACHA_RESOURCE = 'https://agent.qcc.com/mcp/company/stream';
const QICHACHA_CLIENT_NAME = 'LogicNest WorkHub';
const QICHACHA_AUTH_TIMEOUT_MS = 5 * 60 * 1000;

type QichachaRegistrationResponse = {
  client_id?: string;
  client_id_issued_at?: number;
};

export type QichachaPkce = {
  verifier: string;
  challenge: string;
  state: string;
};

export type QichachaCallbackResult = {
  code?: string;
  error?: string;
  errorDescription?: string;
};

export type QichachaTokenResponse = {
  access_token?: string;
  mcp_token?: string;
  api_key?: string;
  token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  token_type?: string;
};

export type QichachaCallbackServer = {
  redirectUri: string;
  result: Promise<QichachaCallbackResult>;
  close: () => void;
};

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function createQichachaPkce(): QichachaPkce {
  const verifier = base64UrlEncode(crypto.randomBytes(64));
  return {
    verifier,
    challenge: base64UrlEncode(crypto.createHash('sha256').update(verifier).digest()),
    state: base64UrlEncode(crypto.randomBytes(32)),
  };
}

function trimNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function describeRemoteError(prefix: string, status: number, body: QichachaTokenResponse | null): Error {
  const detail = trimNonEmpty(body?.error_description) || trimNonEmpty(body?.error);
  const suffix = detail ? `: ${detail}` : ` (HTTP ${status})`;
  const error = new Error(`${prefix}${suffix}`);
  if (body?.error) Object.assign(error, { code: `QICHACHA_${body.error.toUpperCase()}` });
  return error;
}

export function extractQichachaAccessToken(body: QichachaTokenResponse | null): string | undefined {
  return trimNonEmpty(body?.access_token)
    || trimNonEmpty(body?.mcp_token)
    || trimNonEmpty(body?.api_key)
    || trimNonEmpty(body?.token);
}

async function registerQichachaClient(redirectUri: string): Promise<string> {
  const response = await fetch(`${QICHACHA_ISSUER}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: QICHACHA_CLIENT_NAME,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  const text = await response.text();
  let data: QichachaRegistrationResponse | null = null;
  try {
    data = JSON.parse(text) as QichachaRegistrationResponse;
  } catch {
    data = null;
  }
  const clientId = trimNonEmpty(data?.client_id);
  if (!response.ok || !clientId) {
    console.error('[QichachaMCP] OAuth client registration failed', { status: response.status });
    throw new Error(`企查查授权客户端注册失败（HTTP ${response.status}）`);
  }
  console.log('[QichachaMCP] OAuth client registered', { status: response.status });
  return clientId;
}

export function startQichachaCallbackServer(expectedState: string): Promise<QichachaCallbackServer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let resolveResult!: (result: QichachaCallbackResult) => void;
    const result = new Promise<QichachaCallbackResult>(resolveResultValue => {
      resolveResult = resolveResultValue;
    });
    const server = http.createServer((req, res) => {
      const parsed = new URL(req.url || '/', 'http://localhost');
      if (parsed.pathname !== '/callback') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const state = parsed.searchParams.get('state');
      if (state !== expectedState) {
        console.warn('[QichachaMCP] OAuth callback rejected: state mismatch');
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<h1>授权校验失败</h1><p>请关闭此窗口并重新发起授权。</p>');
        return;
      }

      const callbackResult: QichachaCallbackResult = {
        code: trimNonEmpty(parsed.searchParams.get('code')),
        error: trimNonEmpty(parsed.searchParams.get('error')),
        errorDescription: trimNonEmpty(parsed.searchParams.get('error_description')),
      };
      console.log('[QichachaMCP] OAuth callback received', {
        hasCode: Boolean(callbackResult.code),
        error: callbackResult.error || undefined,
      });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<h1>授权完成</h1><p>可以返回逻栖工枢继续使用。</p>');
      if (!settled) {
        settled = true;
        resolveResult(callbackResult);
      }
    });

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('企查查授权回调端口分配失败'));
        return;
      }
      resolve({
        redirectUri: `http://localhost:${address.port}/callback`,
        result,
        close: () => {
          try {
            server.close();
          } catch {
            // Ignore close races during timeout/window shutdown.
          }
        },
      });
    });
  });
}

export async function exchangeQichachaAuthorizationCode(input: {
  clientId: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<string> {
  const response = await fetch(`${QICHACHA_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: input.clientId,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
      resource: QICHACHA_RESOURCE,
    }).toString(),
  });
  const text = await response.text();
  let data: QichachaTokenResponse | null = null;
  try {
    data = JSON.parse(text) as QichachaTokenResponse;
  } catch {
    data = null;
  }
  if (!response.ok) {
    console.error('[QichachaMCP] OAuth token exchange failed', { status: response.status, error: data?.error });
    throw describeRemoteError('企查查授权令牌交换失败', response.status, data);
  }
  const token = extractQichachaAccessToken(data);
  if (!token) {
    console.error('[QichachaMCP] OAuth token exchange returned no token', { status: response.status });
    throw new Error('企查查授权令牌响应无有效凭据');
  }
  console.log('[QichachaMCP] OAuth token exchange succeeded', { status: response.status });
  return token;
}

export async function startQichachaMcpApiKeyLogin(parentWindow?: BrowserWindow | null): Promise<string> {
  const pkce = createQichachaPkce();
  const callbackServer = await startQichachaCallbackServer(pkce.state);
  let authWindow: BrowserWindow | null = null;
  let timeout: NodeJS.Timeout | null = null;

  try {
    const clientId = await registerQichachaClient(callbackServer.redirectUri);
    const authorizeUrl = `${QICHACHA_ISSUER}/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: callbackServer.redirectUri,
      scope: 'mcp:tools',
      state: pkce.state,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      resource: QICHACHA_RESOURCE,
    }).toString()}`;

    console.log('[QichachaMCP] opening OAuth login window');

    return await new Promise<string>((resolve, reject) => {
      let settled = false;
      const settle = (error: Error | null, apiKey?: string) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        callbackServer.close();
        if (authWindow && !authWindow.isDestroyed()) authWindow.close();
        if (error) reject(error);
        else resolve(apiKey || '');
      };

      authWindow = new BrowserWindow({
        width: 1120,
        height: 860,
        parent: parentWindow || undefined,
        modal: false,
        title: '企查查连接授权',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          partition: `qichacha-mcp-auth-${crypto.randomUUID()}`,
        },
      });

      authWindow.on('closed', () => {
        authWindow = null;
        settle(new Error('企查查授权窗口已关闭，尚未完成授权。'));
      });

      timeout = setTimeout(() => {
        settle(new Error('企查查授权超时，请完成网页授权后重试。'));
      }, QICHACHA_AUTH_TIMEOUT_MS);

      void callbackServer.result.then(async callbackResult => {
        if (settled) return;
        if (callbackResult.error) {
          const detail = callbackResult.errorDescription ? `：${callbackResult.errorDescription}` : '';
          settle(new Error(`企查查授权未完成（${callbackResult.error}${detail}）`));
          return;
        }
        if (!callbackResult.code) {
          settle(new Error('企查查授权回调缺少授权码。'));
          return;
        }
        try {
          const token = await exchangeQichachaAuthorizationCode({
            clientId,
            code: callbackResult.code,
            redirectUri: callbackServer.redirectUri,
            verifier: pkce.verifier,
          });
          settle(null, token);
        } catch (error) {
          settle(error instanceof Error ? error : new Error('企查查授权令牌交换失败。'));
        }
      });

      authWindow.loadURL(authorizeUrl).catch(error => {
        console.error('[QichachaMCP] OAuth login window failed to load', {
          message: error instanceof Error ? error.message : String(error),
        });
        settle(new Error('企查查授权页面打开失败，请检查网络连接后重试。'));
      });
    });
  } catch (error) {
    callbackServer.close();
    if (authWindow && !authWindow.isDestroyed()) authWindow.close();
    throw error;
  }
}
