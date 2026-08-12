import { type LicenseActionResult, type LicenseCredentials, type LicenseMembership, LicensePhase, type LicenseRegistration, type LicenseState, type LicenseUser } from '../../shared/license';
import { getDeviceFingerprintDigest } from './deviceFingerprint';
import { LicenseApiClient, LicenseApiError, type LicenseApiPayload } from './licenseApiClient';
import { validateOfflineLease } from './offlineLease';
import type { LicenseSessionRecord, LicenseSessionStore } from './secureSessionStore';

const DEFAULT_HEARTBEAT_SECONDS = 300;
const DEFAULT_OFFLINE_GRACE_HOURS = 72;
const MIN_HEARTBEAT_SECONDS = 30;
const MAX_HEARTBEAT_SECONDS = 3_600;

export interface LicenseControllerOptions {
  apiBaseUrl?: string;
  publicKeyPem?: string;
  heartbeatIntervalSeconds?: number;
  offlineGraceHours?: number;
  clientVersion: string;
  deviceFingerprint?: string;
  sessionStore: LicenseSessionStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
  onStateChanged?: (state: LicenseState) => void;
  onAuthorizationLost?: (reason: string) => void;
}

export class LicenseController {
  private readonly clientVersion: string;
  private readonly deviceFingerprint: string;
  private readonly sessionStore: LicenseSessionStore;
  private readonly publicKeyPem: string;
  private readonly offlineGraceHours: number;
  private readonly now: () => number;
  private readonly onStateChanged?: (state: LicenseState) => void;
  private readonly onAuthorizationLost?: (reason: string) => void;
  private readonly api: LicenseApiClient | null;
  private session: LicenseSessionRecord | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInFlight: Promise<LicenseState> | null = null;
  private refreshInFlight: Promise<LicenseState> | null = null;
  private redeemInFlight: Promise<LicenseActionResult> | null = null;
  private state: LicenseState = {
    phase: LicensePhase.Loading,
    user: null,
    membership: { status: 'none' },
    device: null,
    offlineUntil: null,
    lastServerTime: null,
    heartbeatAfterSeconds: DEFAULT_HEARTBEAT_SECONDS,
  };

  public constructor(options: LicenseControllerOptions) {
    this.clientVersion = options.clientVersion;
    this.deviceFingerprint = options.deviceFingerprint ?? getDeviceFingerprintDigest();
    this.sessionStore = options.sessionStore;
    this.publicKeyPem = options.publicKeyPem ?? process.env.LOGICNEST_LICENSE_PUBLIC_KEY_PEM ?? '';
    this.offlineGraceHours = clampPositive(options.offlineGraceHours ?? numberEnv('LOGICNEST_OFFLINE_GRACE_HOURS', DEFAULT_OFFLINE_GRACE_HOURS), 1, 168);
    this.now = options.now ?? Date.now;
    this.onStateChanged = options.onStateChanged;
    this.onAuthorizationLost = options.onAuthorizationLost;
    const baseUrl = options.apiBaseUrl ?? process.env.LOGICNEST_LICENSE_API_URL;
    this.api = baseUrl ? new LicenseApiClient({ baseUrl, fetchImpl: options.fetchImpl }) : null;
    this.state.heartbeatAfterSeconds = clampPositive(
      options.heartbeatIntervalSeconds ?? numberEnv('LOGICNEST_HEARTBEAT_INTERVAL_SECONDS', DEFAULT_HEARTBEAT_SECONDS),
      MIN_HEARTBEAT_SECONDS,
      MAX_HEARTBEAT_SECONDS,
    );
  }

  public getState(): LicenseState {
    return cloneState(this.state);
  }

  public getDeviceFingerprintDigest(): string {
    return this.deviceFingerprint;
  }

  public async initialize(): Promise<LicenseState> {
    this.session = await this.sessionStore.load();
    if (!this.session) {
      this.setState({ phase: LicensePhase.SignedOut, messageCode: undefined, message: undefined });
      return this.getState();
    }

    this.hydrateStateFromSession();
    if (!this.api) {
      if (this.applyOfflineLease()) {
        this.scheduleHeartbeat();
      } else {
        this.setRestricted('LICENSE_API_NOT_CONFIGURED', '授权服务尚未配置');
      }
      return this.getState();
    }

    await this.heartbeat();
    return this.getState();
  }

  public async register(input: LicenseRegistration): Promise<LicenseActionResult> {
    const credentials = validateCredentials(input);
    if (input.passwordConfirmation !== input.password) {
      throw new LicenseApiError(400, 'PASSWORD_MISMATCH', '两次输入的密码不一致');
    }
    const response = await this.requireApi().register({ ...credentials, passwordConfirmation: input.passwordConfirmation });
    if (!response.accessToken || !response.refreshToken) {
      await this.login(credentials);
    } else {
      await this.applyOnlinePayload(response);
    }
    return { state: this.getState(), requiresRestart: this.isAuthorized() };
  }

  public async login(input: LicenseCredentials): Promise<LicenseActionResult> {
    const credentials = validateCredentials(input);
    const response = await this.requireApi().login({
      ...credentials,
      deviceFingerprint: this.deviceFingerprint,
      clientVersion: this.clientVersion,
    });
    if (!response.accessToken || !response.refreshToken || !response.user || !response.membership) {
      throw new LicenseApiError(502, 'INVALID_AUTH_RESPONSE', '授权服务返回了无效的登录结果');
    }
    await this.applyOnlinePayload(response);
    return { state: this.getState(), requiresRestart: this.isAuthorized() };
  }

  public async redeem(code: string): Promise<LicenseActionResult> {
    if (this.redeemInFlight) return this.redeemInFlight;
    this.redeemInFlight = this.performRedeem(code).finally(() => {
      this.redeemInFlight = null;
    });
    return this.redeemInFlight;
  }

  private async performRedeem(code: string): Promise<LicenseActionResult> {
    const normalizedCode = normalizeLicenseCode(code);
    if (!/^LQGX(?:-[A-Z0-9]{4}){4}$/.test(normalizedCode)) {
      throw new LicenseApiError(400, 'INVALID_LICENSE_CODE', '请输入完整的卡密格式');
    }
    if (!this.session?.accessToken) {
      throw new LicenseApiError(401, 'SESSION_REQUIRED', '请先登录');
    }
    const response = await this.requireApi().redeem(this.session.accessToken, {
      code: normalizedCode,
      deviceFingerprint: this.deviceFingerprint,
      clientVersion: this.clientVersion,
    });
    await this.applyOnlinePayload(response);
    await this.heartbeat();
    return { state: this.getState(), requiresRestart: this.isAuthorized() };
  }

  public async refresh(): Promise<LicenseState> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<LicenseState> {
    if (!this.session?.refreshToken) return this.getState();
    try {
      const response = await this.requireApi().refresh(this.session.refreshToken, this.deviceFingerprint);
      if (!response.accessToken || !response.refreshToken) throw new LicenseApiError(502, 'INVALID_REFRESH_RESPONSE', '刷新结果无效');
      await this.applyOnlinePayload(response);
      console.debug('[License] access token refreshed', { requestId: response.requestId });
    } catch (error) {
      logLicenseOperationFailure('refresh', error);
      if (isTerminalAuthError(error)) {
        await this.invalidateSession(error.code);
        this.setState({ phase: LicensePhase.Restricted, messageCode: error.code, message: '当前账号或设备已失去授权，请重新登录或联系管理员' });
      }
      throw error;
    }
    return this.getState();
  }

  public async heartbeat(): Promise<LicenseState> {
    if (this.heartbeatInFlight) return this.heartbeatInFlight;
    this.heartbeatInFlight = this.performHeartbeat().finally(() => {
      this.heartbeatInFlight = null;
    });
    return this.heartbeatInFlight;
  }

  public async logout(): Promise<LicenseState> {
    const accessToken = this.session?.accessToken;
    const refreshToken = this.session?.refreshToken;
    try {
      if (accessToken && refreshToken && this.api) await this.api.logout(accessToken, refreshToken);
    } catch {
      // Local logout must still succeed when the service is unavailable.
    }
    await this.invalidateSession('LOGOUT');
    this.setState({
      phase: LicensePhase.SignedOut,
      user: null,
      membership: { status: 'none' },
      device: null,
      offlineUntil: null,
      lastServerTime: null,
      messageCode: undefined,
      message: undefined,
    });
    return this.getState();
  }

  public dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async performHeartbeat(): Promise<LicenseState> {
    if (!this.session?.accessToken) {
      this.setState({ phase: LicensePhase.SignedOut });
      return this.getState();
    }
    if (!this.api) {
      this.applyOfflineOrRestrict();
      this.scheduleHeartbeat();
      return this.getState();
    }
    let heartbeatOperation = 'heartbeat';
    try {
      let response: LicenseApiPayload;
      try {
        response = await this.api.heartbeat(this.session.accessToken, {
          deviceFingerprint: this.deviceFingerprint,
          clientVersion: this.clientVersion,
        });
      } catch (error) {
        if (error instanceof LicenseApiError && error.status === 401) {
          logLicenseOperationFailure('heartbeat', error);
          await this.refresh();
          heartbeatOperation = 'heartbeat-retry';
          response = await this.api.heartbeat(this.session.accessToken, {
            deviceFingerprint: this.deviceFingerprint,
            clientVersion: this.clientVersion,
          });
        } else {
          throw error;
        }
      }
      await this.applyOnlinePayload(response);
    } catch (error) {
      logLicenseOperationFailure(heartbeatOperation, error);
      if (isTerminalAuthError(error)) {
        if (this.session || this.state.phase !== LicensePhase.Restricted) {
          await this.invalidateSession(error.code);
          this.setState({
            phase: LicensePhase.Restricted,
            messageCode: error.code,
            message: '当前账号或设备已失去授权，请重新登录或联系管理员',
          });
        }
      } else {
        this.applyOfflineOrRestrict();
      }
    }
    this.scheduleHeartbeat();
    return this.getState();
  }

  private async applyOnlinePayload(payload: LicenseApiPayload): Promise<void> {
    const hasAccessToken = payload.accessToken !== undefined;
    const hasRefreshToken = payload.refreshToken !== undefined;
    const hasTokenPair = Boolean(payload.accessToken && payload.refreshToken);
    if (hasAccessToken !== hasRefreshToken || ((hasAccessToken || hasRefreshToken) && !hasTokenPair)) {
      throw new LicenseApiError(502, 'INVALID_REFRESH_RESPONSE', '刷新结果无效', payload.requestId);
    }

    const currentSession = this.session;
    if (!currentSession && (!hasTokenPair || !payload.user || !payload.membership)) {
      throw new LicenseApiError(502, 'INVALID_SESSION', '授权会话无效', payload.requestId);
    }

    const accessTokenExpiresAt = hasTokenPair
      ? payload.accessTokenExpiresAt
        ?? (payload.expiresIn !== undefined ? new Date(this.now() + payload.expiresIn * 1000).toISOString() : undefined)
      : currentSession?.accessTokenExpiresAt;
    let nextSession: LicenseSessionRecord;
    if (currentSession) {
      nextSession = {
        ...currentSession,
        ...(hasTokenPair
          ? { accessToken: payload.accessToken!, refreshToken: payload.refreshToken!, accessTokenExpiresAt }
          : {}),
        user: payload.user ?? currentSession.user,
        membership: payload.membership ?? currentSession.membership,
        device: payload.device === undefined ? currentSession.device : payload.device,
        licenseCacheJws: payload.licenseCacheJws ?? currentSession.licenseCacheJws,
        offlineUntil: payload.offlineUntil ?? currentSession.offlineUntil,
        lastServerTime: payload.serverTime ?? currentSession.lastServerTime,
        observedWallClockMs: this.now(),
      };
    } else {
      nextSession = {
        accessToken: payload.accessToken!,
        refreshToken: payload.refreshToken!,
        accessTokenExpiresAt,
        user: payload.user!,
        membership: payload.membership!,
        device: payload.device ?? null,
        licenseCacheJws: payload.licenseCacheJws,
        offlineUntil: payload.offlineUntil,
        lastServerTime: payload.serverTime,
        observedWallClockMs: this.now(),
      };
    }

    // Keep rotated credentials in memory even if durable persistence fails.
    // The server has already revoked the previous refresh token, so rolling
    // back would guarantee a later refresh-token-reuse failure.
    this.session = nextSession;
    try {
      await this.sessionStore.save(nextSession);
    } catch (error) {
      logLicenseOperationFailure('session-persist', error);
      throw error;
    }
    const serverTime = payload.serverTime ?? this.session.lastServerTime;
    const offlineUntil = payload.offlineUntil ?? this.session.offlineUntil;
    this.setState({
      phase: resolveOnlinePhase(this.session.membership, this.session.user, this.session.device, this.now()),
      user: this.session.user,
      membership: this.session.membership,
      device: this.session.device,
      offlineUntil: offlineUntil ?? null,
      lastServerTime: serverTime ?? null,
      heartbeatAfterSeconds: clampPositive(payload.heartbeatAfterSeconds ?? this.state.heartbeatAfterSeconds, MIN_HEARTBEAT_SECONDS, MAX_HEARTBEAT_SECONDS),
      messageCode: undefined,
      message: undefined,
    });
  }

  private hydrateStateFromSession(): void {
    if (!this.session) return;
    this.setState({
      phase: resolveOnlinePhase(this.session.membership, this.session.user, this.session.device, this.now()),
      user: this.session.user,
      membership: this.session.membership,
      device: this.session.device,
      offlineUntil: this.session.offlineUntil ?? null,
      lastServerTime: this.session.lastServerTime ?? null,
    });
  }

  private applyOfflineOrRestrict(): void {
    if (this.applyOfflineLease()) return;
    this.setRestricted('OFFLINE_GRACE_EXPIRED', '网络不可用，离线授权已超过宽限期');
  }

  private applyOfflineLease(): boolean {
    if (!this.session?.licenseCacheJws || !this.session.user || !this.publicKeyPem) return false;
    const lastServerTimeMs = this.session.lastServerTime ? Date.parse(this.session.lastServerTime) : undefined;
    const validation = validateOfflineLease(this.session.licenseCacheJws, {
      publicKeyPem: this.publicKeyPem,
      expectedUid: this.session.user.uid,
      expectedDeviceDigest: this.deviceFingerprint,
      nowMs: this.now(),
      lastServerTimeMs: Number.isFinite(lastServerTimeMs) ? lastServerTimeMs : undefined,
    });
    if (!validation.valid || !validation.payload) return false;
    const serverTimeMs = Date.parse(validation.payload.serverTime);
    const maximumOfflineUntil = serverTimeMs + this.offlineGraceHours * 60 * 60 * 1000;
    if (!Number.isFinite(serverTimeMs) || Date.parse(validation.payload.offlineUntil) > maximumOfflineUntil) return false;
    const offlineUntil = validation.payload.offlineUntil;
    this.setState({
      phase: LicensePhase.OfflineGrace,
      user: this.session.user,
      membership: this.session.membership.status === 'active'
        ? this.session.membership
        : { ...this.session.membership, status: 'active', expiresAt: validation.payload.membershipExpiresAt },
      device: this.session.device,
      offlineUntil,
      lastServerTime: validation.payload.serverTime,
      heartbeatAfterSeconds: validation.payload.heartbeatAfterSeconds,
      messageCode: 'OFFLINE_GRACE',
      message: '当前处于离线宽限期，联网后将自动重新校验授权',
    });
    return true;
  }

  private setRestricted(code: string, message: string): void {
    const wasAuthorized = this.isAuthorized();
    this.setState({ phase: LicensePhase.Restricted, messageCode: code, message });
    if (wasAuthorized) this.onAuthorizationLost?.(code);
  }

  private async invalidateSession(reason: string, notify = true): Promise<void> {
    const wasAuthorized = this.isAuthorized();
    this.session = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.sessionStore.clear();
    if (notify && wasAuthorized) this.onAuthorizationLost?.(reason);
  }

  private scheduleHeartbeat(): void {
    if (this.timer) clearTimeout(this.timer);
    if (!this.session || !this.isAuthorized()) return;
    const delay = this.state.heartbeatAfterSeconds * 1000;
    this.timer = setTimeout(() => {
      void this.heartbeat();
    }, delay);
    const timerWithUnref = this.timer as ReturnType<typeof setTimeout> & { unref?: () => void };
    timerWithUnref.unref?.();
  }

  private setState(patch: Partial<LicenseState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChanged?.(this.getState());
  }

  private isAuthorized(): boolean {
    return this.state.phase === LicensePhase.Authorized || this.state.phase === LicensePhase.OfflineGrace;
  }

  private requireApi(): LicenseApiClient {
    if (!this.api) throw new LicenseApiError(503, 'LICENSE_API_NOT_CONFIGURED', '授权服务尚未配置');
    return this.api;
  }
}

export function isLicenseAuthorized(state: LicenseState): boolean {
  return state.phase === LicensePhase.Authorized || state.phase === LicensePhase.OfflineGrace;
}

function validateCredentials(input: LicenseCredentials): LicenseCredentials {
  const phone = normalizePhone(input.phone);
  if (!/^\+861[3-9]\d{9}$/.test(phone)) {
    throw new LicenseApiError(400, 'INVALID_PHONE', '请输入有效的中国大陆手机号');
  }
  if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128) {
    throw new LicenseApiError(400, 'INVALID_PASSWORD', '密码长度需为 8 到 128 位');
  }
  return { phone, password: input.password };
}

export function normalizePhone(phone: string): string {
  const compact = phone.trim().replace(/[\s-]/g, '');
  if (/^1[3-9]\d{9}$/.test(compact)) return `+86${compact}`;
  if (/^00861[3-9]\d{9}$/.test(compact)) return `+${compact.slice(2)}`;
  return compact;
}

export function normalizeLicenseCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s_]+/g, '-');
}

function resolveOnlinePhase(
  membership: LicenseMembership,
  user: LicenseUser,
  device: LicenseSessionRecord['device'],
  nowMs: number,
): LicensePhase {
  if (user.status !== 'active' || device?.status === 'suspended') return LicensePhase.Restricted;
  const hasActiveMembership = membership.status === 'active'
    && Boolean(membership.expiresAt)
    && Date.parse(membership.expiresAt as string) > nowMs;
  if (!hasActiveMembership) return LicensePhase.ActivationRequired;
  return device?.status === 'active' ? LicensePhase.Authorized : LicensePhase.Restricted;
}

function isTerminalAuthError(error: unknown): error is LicenseApiError {
  return error instanceof LicenseApiError && (
    error.status === 401
    || error.status === 403
    || ['SESSION_REVOKED', 'USER_SUSPENDED', 'DEVICE_SUSPENDED', 'DEVICE_MISMATCH', 'LICENSE_REVOKED'].includes(error.code)
  );
}

function logLicenseOperationFailure(operation: string, error: unknown): void {
  if (error instanceof LicenseApiError) {
    console.warn(`[License] ${operation} failed`, {
      status: error.status,
      code: error.code,
      requestId: error.requestId,
    });
    return;
  }
  console.warn(`[License] ${operation} failed`, {
    code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
  });
}

function cloneState(state: LicenseState): LicenseState {
  return JSON.parse(JSON.stringify(state)) as LicenseState;
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function clampPositive(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
