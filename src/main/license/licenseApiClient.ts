import { createHash, randomUUID } from 'node:crypto';
import * as https from 'node:https';

export interface LicenseApiPayload {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  expiresIn?: number;
  user?: {
    uid: string;
    phoneMasked: string;
    status: 'active' | 'suspended';
  };
  membership?: {
    status: 'none' | 'active' | 'expired' | 'revoked';
    planCode?: string;
    expiresAt?: string;
    entitlementVersion?: number;
  };
  device?: {
    status: 'active' | 'suspended' | 'unbound';
    lastOnlineAt?: string;
    clientVersion?: string;
  } | null;
  licenseCacheJws?: string;
  serverTime?: string;
  offlineUntil?: string;
  heartbeatAfterSeconds?: number;
  requestId?: string;
}

export class LicenseApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly requestId?: string;

  public constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'LicenseApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface LicenseApiClientOptions {
  baseUrl: string;
  fetchImpl?: LicenseFetch;
  trustedCaPem?: string;
  timeoutMs?: number;
}

export interface LicenseCatalogItem {
  id: string;
  releaseId: string;
  kind: 'SKILL' | 'KIT' | 'CONNECTOR';
  slug: string;
  version: string;
  nameZh: string;
  nameEn?: string | null;
  descriptionZh: string;
  descriptionEn?: string | null;
  sortOrder: number;
  tags: string[];
  metadata: Record<string, unknown>;
  status: 'PUBLISHED';
  publishedAt?: string | null;
  assets: Array<{ role: string; originalName: string; mimeType: string; sizeBytes: number; sha256: string }>;
}

export interface LicenseCatalogResponse {
  items: LicenseCatalogItem[];
  etag?: string;
  notModified?: boolean;
}

type LicenseFetch = (input: string, init?: RequestInit) => Promise<Response>;

export class LicenseApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: LicenseFetch;
  private readonly timeoutMs: number;

  public constructor(options: LicenseApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl
      ?? (options.trustedCaPem ? createTrustedCaFetch(options.trustedCaPem) : fetch);
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  public register(input: {
    phone: string;
    password: string;
    passwordConfirmation: string;
    deviceFingerprint: string;
    clientVersion: string;
  }): Promise<LicenseApiPayload> {
    return this.request('/auth/register', {
      method: 'POST',
      body: {
        phone: input.phone,
        password: input.password,
        confirmPassword: input.passwordConfirmation,
        deviceFingerprint: input.deviceFingerprint,
        clientVersion: input.clientVersion,
      },
    });
  }

  public login(input: { phone: string; password: string; deviceFingerprint: string; clientVersion: string }): Promise<LicenseApiPayload> {
    return this.request('/auth/login', { method: 'POST', body: input });
  }

  public refresh(refreshToken: string, deviceFingerprint: string): Promise<LicenseApiPayload> {
    return this.request('/auth/refresh', {
      method: 'POST',
      body: { refreshToken, deviceFingerprint },
    });
  }

  public logout(accessToken: string, refreshToken: string): Promise<LicenseApiPayload> {
    return this.request('/auth/logout', {
      method: 'POST',
      accessToken,
      body: { refreshToken },
    });
  }

  public redeem(accessToken: string, input: { code: string; deviceFingerprint: string; clientVersion: string }): Promise<LicenseApiPayload> {
    return this.request('/license/redeem', {
      method: 'POST',
      accessToken,
      body: { licenseKey: input.code, deviceFingerprint: input.deviceFingerprint, clientVersion: input.clientVersion },
    });
  }

  public heartbeat(accessToken: string, input: { deviceFingerprint: string; clientVersion: string }): Promise<LicenseApiPayload> {
    return this.request('/license/heartbeat', { method: 'POST', accessToken, body: input });
  }

  private async request(
    endpoint: string,
    options: { method: 'POST'; accessToken?: string; body?: unknown },
  ): Promise<LicenseApiPayload> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const localRequestId = randomUUID();
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
        method: options.method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-request-id': localRequestId,
          ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const parsed: unknown = await response.json().catch((): null => null);
      const envelope = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
      const rawError = asRecord(envelope.error);
      const requestId = typeof envelope.requestId === 'string'
        ? envelope.requestId
        : typeof rawError?.requestId === 'string' ? rawError.requestId : undefined;
      if (!response.ok) {
        const error = rawError ?? {};
        const code = typeof error.code === 'string' ? error.code : `HTTP_${response.status}`;
        const message = typeof error.message === 'string' ? error.message : '授权服务请求失败';
        throw new LicenseApiError(response.status, code, message, requestId);
      }
      const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : envelope;
      return normalizeLicensePayload(data, requestId);
    } catch (error) {
      if (error instanceof LicenseApiError) throw error;
      if (controller.signal.aborted) {
        throw new LicenseApiError(408, 'LICENSE_REQUEST_TIMEOUT', '授权请求超时，请检查网络后重试', localRequestId);
      }
      if (isCertificateError(error)) {
        throw new LicenseApiError(495, 'LICENSE_CERTIFICATE_ERROR', '服务器安全证书无法验证，请联系管理员检查证书配置', localRequestId);
      }
      throw new LicenseApiError(503, 'LICENSE_NETWORK_ERROR', '无法连接授权服务器，请检查网络后重试', localRequestId);
    } finally {
      clearTimeout(timeout);
    }
  }

  public async catalog(accessToken: string, kind?: LicenseCatalogItem['kind'], etag?: string): Promise<LicenseCatalogResponse> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/catalog${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(etag ? { 'if-none-match': etag } : {}),
        authorization: `Bearer ${accessToken}`,
      },
    });
    if (response.status === 304) return { items: [], etag, notModified: true };
    const body = await response.json().catch((): null => null) as Record<string, unknown> | null;
    if (!response.ok) throw parseRawLicenseError(response.status, body);
    const items = Array.isArray(body?.items) ? body.items : [];
    return {
      items: items.filter(isCatalogItem),
      etag: response.headers.get('etag') ?? undefined,
    };
  }

  public async downloadCatalogAsset(accessToken: string, itemId: string, role: string): Promise<{
    data: Buffer; fileName: string; mimeType: string; sizeBytes: number; sha256: string;
  }> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/catalog/${encodeURIComponent(itemId)}/assets/${encodeURIComponent(role)}`, {
      method: 'GET',
      headers: { accept: 'application/octet-stream', authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.json().catch((): null => null) as Record<string, unknown> | null;
      throw parseRawLicenseError(response.status, body);
    }
    const data = Buffer.from(await response.arrayBuffer());
    const digest = createHash('sha256').update(data).digest('hex');
    const expected = response.headers.get('x-content-sha256') ?? digest;
    if (digest !== expected.toLowerCase()) throw new LicenseApiError(502, 'CATALOG_ASSET_INTEGRITY_FAILED', '目录资源校验失败');
    const disposition = response.headers.get('content-disposition') ?? '';
    const fileName = decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ?? `${itemId}-${role}.bin`);
    return {
      data,
      fileName,
      mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
      sizeBytes: data.byteLength,
      sha256: digest,
    };
  }

  public requestAuthorized(accessToken: string, url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('authorization', `Bearer ${accessToken}`);
    return this.fetchWithTimeout(url, { ...options, headers });
  }

  private fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const parentSignal = init.signal;
    const abortFromParent = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener('abort', abortFromParent, { once: true });
    }
    return this.fetchImpl(input, { ...init, signal: controller.signal })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          throw new LicenseApiError(408, 'LICENSE_REQUEST_TIMEOUT', '授权请求超时，请检查网络后重试');
        }
        if (isCertificateError(error)) {
          throw new LicenseApiError(495, 'LICENSE_CERTIFICATE_ERROR', '服务器安全证书无法验证，请联系管理员检查证书配置');
        }
        throw error;
      })
      .finally(() => {
        clearTimeout(timeout);
        parentSignal?.removeEventListener('abort', abortFromParent);
      });
  }
}

function parseRawLicenseError(status: number, body: Record<string, unknown> | null): LicenseApiError {
  const error = body?.error && typeof body.error === 'object' ? body.error as Record<string, unknown> : body ?? {};
  return new LicenseApiError(
    status,
    typeof error.code === 'string' ? error.code : `HTTP_${status}`,
    typeof error.message === 'string' ? error.message : '目录服务请求失败',
    typeof error.requestId === 'string' ? error.requestId : undefined,
  );
}

function isCatalogItem(value: unknown): value is LicenseCatalogItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<LicenseCatalogItem>;
  return typeof item.id === 'string' && typeof item.releaseId === 'string'
    && (item.kind === 'SKILL' || item.kind === 'KIT' || item.kind === 'CONNECTOR')
    && typeof item.slug === 'string' && typeof item.version === 'string'
    && typeof item.nameZh === 'string' && typeof item.descriptionZh === 'string'
    && Array.isArray(item.assets);
}

function createTrustedCaFetch(trustedCaPem: string): LicenseFetch {
  return async (input, init = {}) => {
    const url = new URL(input);
    if (url.protocol !== 'https:') throw new Error('Trusted CA transport requires HTTPS');
    const headers = new Headers(init.headers);
    const body = init.body;
    if (body !== undefined && body !== null && typeof body !== 'string') {
      throw new Error('Trusted CA transport only accepts string request bodies');
    }

    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      const request = https.request(url, {
        method: init.method ?? 'GET',
        headers: Object.fromEntries(headers.entries()),
        ca: trustedCaPem,
        rejectUnauthorized: true,
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          if (settled) return;
          settled = true;
          init.signal?.removeEventListener('abort', abortRequest);
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) {
              for (const item of value) responseHeaders.append(name, item);
            } else if (value !== undefined) {
              responseHeaders.set(name, String(value));
            }
          }
          resolve(new Response(Buffer.concat(chunks), {
            status: response.statusCode ?? 500,
            statusText: response.statusMessage,
            headers: responseHeaders,
          }));
        });
        response.on('error', rejectOnce);
      });
      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        init.signal?.removeEventListener('abort', abortRequest);
        reject(error);
      };
      const abortRequest = () => {
        rejectOnce(Object.assign(new Error('Request aborted'), { name: 'AbortError' }));
        request.destroy();
      };
      request.on('error', rejectOnce);
      if (init.signal?.aborted) {
        abortRequest();
        return;
      }
      init.signal?.addEventListener('abort', abortRequest, { once: true });
      if (body) request.write(body);
      request.end();
    });
  };
}

function isCertificateError(error: unknown): boolean {
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const cause = candidate.cause && typeof candidate.cause === 'object'
    ? candidate.cause as Record<string, unknown>
    : {};
  const code = String(candidate.code ?? cause.code ?? '');
  const message = String(candidate.message ?? cause.message ?? '');
  return /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY_LEAF_SIGNATURE/i.test(`${code} ${message}`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeLicensePayload(value: unknown, requestId?: string): LicenseApiPayload {
  const raw = asRecord(value) ?? {};
  const rawUser = asRecord(raw.user);
  const rawMembership = asRecord(raw.membership) ?? asRecord(raw.entitlement);
  const rawPlan = asRecord(rawMembership?.plan);
  const rawDevice = asRecord(raw.device);
  const hasMembershipPayload = Object.prototype.hasOwnProperty.call(raw, 'membership')
    || Object.prototype.hasOwnProperty.call(raw, 'entitlement');
  const hasDevicePayload = Object.prototype.hasOwnProperty.call(raw, 'device');
  const normalizeStatus = (status: unknown): string => typeof status === 'string' ? status.toLowerCase() : '';
  const membershipStatus = rawMembership
    ? normalizeStatus(rawMembership.status)
    : 'none';
  const nextHeartbeatAt = typeof raw.nextHeartbeatAt === 'string' ? Date.parse(raw.nextHeartbeatAt) : Number.NaN;
  const heartbeatAfterSeconds = typeof raw.heartbeatAfterSeconds === 'number'
    ? raw.heartbeatAfterSeconds
    : Number.isFinite(nextHeartbeatAt)
      ? Math.max(30, Math.round((nextHeartbeatAt - Date.now()) / 1000))
      : undefined;

  return {
    ...(typeof raw.accessToken === 'string' ? { accessToken: raw.accessToken } : {}),
    ...(typeof raw.refreshToken === 'string' ? { refreshToken: raw.refreshToken } : {}),
    ...(typeof raw.accessTokenExpiresAt === 'string' ? { accessTokenExpiresAt: raw.accessTokenExpiresAt } : {}),
    ...(typeof raw.expiresIn === 'number' ? { expiresIn: raw.expiresIn } : {}),
    ...(rawUser && typeof rawUser.uid === 'string'
      ? {
          user: {
            uid: rawUser.uid,
            phoneMasked: typeof rawUser.phoneMasked === 'string'
              ? rawUser.phoneMasked
              : typeof rawUser.phone === 'string' ? rawUser.phone : '',
            status: normalizeStatus(rawUser.status) === 'suspended' ? 'suspended' as const : 'active' as const,
          },
        }
      : {}),
    ...(hasMembershipPayload
      ? {
          membership: {
            status: membershipStatus === 'active'
              ? 'active' as const
              : membershipStatus === 'expired'
                ? 'expired' as const
                : membershipStatus === 'revoked' ? 'revoked' as const : 'none' as const,
            ...(typeof rawMembership?.planCode === 'string'
              ? { planCode: rawMembership.planCode }
              : typeof rawPlan?.code === 'string' ? { planCode: rawPlan.code } : {}),
            ...(typeof rawMembership?.expiresAt === 'string' ? { expiresAt: rawMembership.expiresAt } : {}),
            ...(typeof rawMembership?.entitlementVersion === 'number'
              ? { entitlementVersion: rawMembership.entitlementVersion }
              : typeof rawMembership?.version === 'number' ? { entitlementVersion: rawMembership.version } : {}),
          },
        }
      : {}),
    ...(hasDevicePayload
      ? {
          device: raw.device === null
            ? null
            : rawDevice
              ? {
                  status: normalizeStatus(rawDevice.status) === 'suspended'
                    ? 'suspended' as const
                    : normalizeStatus(rawDevice.status) === 'active' ? 'active' as const : 'unbound' as const,
                  ...(typeof rawDevice.lastOnlineAt === 'string'
                    ? { lastOnlineAt: rawDevice.lastOnlineAt }
                    : typeof rawDevice.lastSeenAt === 'string' ? { lastOnlineAt: rawDevice.lastSeenAt } : {}),
                  ...(typeof rawDevice.clientVersion === 'string' ? { clientVersion: rawDevice.clientVersion } : {}),
                }
              : null,
        }
      : {}),
    ...(typeof raw.licenseCacheJws === 'string'
      ? { licenseCacheJws: raw.licenseCacheJws }
      : typeof raw.offlineLicenseJws === 'string' ? { licenseCacheJws: raw.offlineLicenseJws } : {}),
    ...(typeof raw.serverTime === 'string' ? { serverTime: raw.serverTime } : {}),
    ...(typeof raw.offlineUntil === 'string' ? { offlineUntil: raw.offlineUntil } : {}),
    ...(heartbeatAfterSeconds !== undefined ? { heartbeatAfterSeconds } : {}),
    ...(requestId ? { requestId } : {}),
  };
}
