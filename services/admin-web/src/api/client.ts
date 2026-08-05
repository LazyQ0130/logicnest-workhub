const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIE_NAME = 'ln_admin_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const AUTH_EXPIRED_EVENT = 'logicnest:auth-expired';
const AUTHENTICATED_SESSION_KEY = 'logicnest:admin-authenticated';

function readAuthenticatedSessionMarker(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(AUTHENTICATED_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function markAuthenticatedSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(AUTHENTICATED_SESSION_KEY, '1');
  } catch {
    // Session storage can be unavailable in hardened browser profiles.
  }
}

export function clearAuthenticatedSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(AUTHENTICATED_SESSION_KEY);
  } catch {
    // Session storage can be unavailable in hardened browser profiles.
  }
}

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  requestId?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(status: number, payload: ApiErrorPayload = {}) {
    super(payload.message || defaultMessage(status));
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code || `HTTP_${status}`;
    this.requestId = payload.requestId;
    this.details = payload.details;
  }
}

function defaultMessage(status: number): string {
  if (status === 400) return '请检查输入内容';
  if (status === 401) return '登录已失效，请重新登录';
  if (status === 403) return '当前账号无权执行此操作';
  if (status === 404) return '请求的资源不存在';
  if (status === 409) return '操作与当前数据状态冲突';
  if (status === 429) return '操作过于频繁，请稍后再试';
  if (status >= 500) return '服务暂时不可用，请稍后再试';
  return '请求失败';
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!item) return undefined;
  return decodeURIComponent(item.slice(prefix.length));
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  return text || undefined;
}

function asErrorPayload(payload: unknown): ApiErrorPayload {
  if (!payload || typeof payload !== 'object') return {};
  const root = payload as Record<string, unknown>;
  const candidate =
    root.error && typeof root.error === 'object'
      ? (root.error as Record<string, unknown>)
      : root;
  return {
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    message:
      typeof candidate.message === 'string' ? candidate.message : undefined,
    requestId:
      typeof candidate.requestId === 'string' ? candidate.requestId : undefined,
    details: candidate.details,
  };
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipCsrf?: boolean;
}

export class ApiClient {
  private csrfToken?: string;

  constructor(
    readonly baseUrl =
      import.meta.env.VITE_ADMIN_API_BASE_URL || '/api/v1/admin',
  ) {}

  setCsrfToken(token?: string): void {
    this.csrfToken = token || undefined;
  }

  clearSessionState(): void {
    this.csrfToken = undefined;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (
        options.body instanceof FormData ||
        options.body instanceof URLSearchParams ||
        typeof options.body === 'string' ||
        options.body instanceof Blob
      ) {
        body = options.body;
      } else {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(options.body);
      }
    }

    if (!SAFE_METHODS.has(method) && !options.skipCsrf) {
      const token = this.csrfToken || readCookie(CSRF_COOKIE_NAME);
      if (!token) {
        throw new ApiError(403, {
          code: 'CSRF_TOKEN_MISSING',
          message: '安全令牌缺失，请刷新页面后重试',
        });
      }
      headers.set(CSRF_HEADER_NAME, token);
    }

    let response: Response;
    try {
      response = await fetch(joinUrl(this.baseUrl, path), {
        ...options,
        method,
        headers,
        body,
        credentials: 'include',
        redirect: 'error',
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, {
        code: 'NETWORK_ERROR',
        message: '无法连接管理服务，请检查网络或服务状态',
        details: error,
      });
    }

    const payload = await parseResponse(response);
    const responseToken = response.headers.get(CSRF_HEADER_NAME);
    if (responseToken) this.csrfToken = responseToken;
    if (
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { csrfToken?: unknown }).csrfToken === 'string'
    ) {
      this.csrfToken = (payload as { csrfToken: string }).csrfToken;
    }

    if (!response.ok) {
      const error = new ApiError(response.status, asErrorPayload(payload));
      if (
        response.status === 401
        && typeof window !== 'undefined'
        && readAuthenticatedSessionMarker()
      ) {
        this.clearSessionState();
        clearAuthenticatedSession();
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      }
      throw error;
    }

    return payload as T;
  }
}

export const apiClient = new ApiClient();
export { AUTH_EXPIRED_EVENT };
