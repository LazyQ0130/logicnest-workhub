import { randomUUID } from 'node:crypto';

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

export class LicenseApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(options: LicenseApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
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
