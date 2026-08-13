import { createHash, randomUUID } from 'node:crypto';

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
  fetchImpl?: typeof fetch;
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

export class LicenseApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(options: LicenseApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  public register(input: { phone: string; password: string; passwordConfirmation: string }): Promise<LicenseApiPayload> {
    return this.request('/auth/register', {
      method: 'POST',
      body: { phone: input.phone, password: input.password, confirmPassword: input.passwordConfirmation },
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

  public async catalog(accessToken: string, kind?: LicenseCatalogItem['kind'], etag?: string): Promise<LicenseCatalogResponse> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/catalog${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        ...(etag ? { 'if-none-match': etag } : {}),
      },
    });
    if (response.status === 304) return { items: [], etag, notModified: true };
    const body = await response.json().catch((): null => null) as Record<string, unknown> | null;
    if (!response.ok) throw parseRawLicenseError(response.status, body);
    return {
      items: (Array.isArray(body?.items) ? body.items : []).filter(isCatalogItem),
      etag: response.headers.get('etag') ?? undefined,
    };
  }

  public async downloadCatalogAsset(accessToken: string, itemId: string, role: string): Promise<{
    data: Buffer; fileName: string; mimeType: string; sizeBytes: number; sha256: string;
  }> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/catalog/${encodeURIComponent(itemId)}/assets/${encodeURIComponent(role)}`,
      { method: 'GET', headers: { accept: 'application/octet-stream', authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      const body = await response.json().catch((): null => null) as Record<string, unknown> | null;
      throw parseRawLicenseError(response.status, body);
    }
    const data = Buffer.from(await response.arrayBuffer());
    const digest = createHash('sha256').update(data).digest('hex');
    const expected = response.headers.get('x-content-sha256');
    if (!expected || digest !== expected.toLowerCase()) {
      throw new LicenseApiError(502, 'CATALOG_ASSET_INTEGRITY_FAILED', '目录资源校验失败');
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    return {
      data,
      fileName: encodedName ? decodeURIComponent(encodedName) : `${itemId}-${role}.bin`,
      mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
      sizeBytes: data.byteLength,
      sha256: digest,
    };
  }

  private async request(
    endpoint: string,
    options: { method: 'POST'; accessToken?: string; body?: unknown },
  ): Promise<LicenseApiPayload> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
        method: options.method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
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
    } finally {
      clearTimeout(timeout);
    }
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
  return typeof item.id === 'string'
    && typeof item.releaseId === 'string'
    && (item.kind === 'SKILL' || item.kind === 'KIT' || item.kind === 'CONNECTOR')
    && typeof item.slug === 'string'
    && typeof item.version === 'string'
    && typeof item.nameZh === 'string'
    && typeof item.descriptionZh === 'string'
    && Array.isArray(item.assets);
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
