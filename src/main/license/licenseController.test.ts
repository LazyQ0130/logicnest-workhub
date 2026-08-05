import { generateKeyPairSync, sign } from 'node:crypto';

import { beforeEach, describe, expect, test, vi } from 'vitest';

import { APP_USER_MODEL_ID } from '../../shared/brand';
import { LicensePhase } from '../../shared/license';
import { LicenseApiError } from './licenseApiClient';
import { LicenseController } from './licenseController';
import type { LicenseSessionRecord, LicenseSessionStore } from './secureSessionStore';

const API_BASE_URL = 'https://license.example/api/v1';
const DEVICE_FINGERPRINT = 'device-fingerprint-1';
const NOW_MS = Date.parse('2030-01-01T00:00:00.000Z');
const MEMBERSHIP_EXPIRES_AT = '2099-01-01T00:00:00.000Z';

describe('LicenseController', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  test('refreshes an expired access token, persists the rotated pair, and survives restart', async () => {
    const harness = createSessionStore(createAuthorizedSession());
    const fetchMock = createFetchMock([
      errorResponse(401, 'INVALID_ACCESS_TOKEN', 'req-expired'),
      jsonResponse({ accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 }, 'req-refresh'),
      heartbeatResponse('req-heartbeat-retry'),
    ]);
    const authorizationLost = vi.fn();
    const controller = createController(harness.store, fetchMock, { onAuthorizationLost: authorizationLost });

    const state = await controller.initialize();

    expect(state.phase).toBe(LicensePhase.Authorized);
    expect(requestAuthorization(fetchMock, 0)).toBe('Bearer access-1');
    expect(requestAuthorization(fetchMock, 2)).toBe('Bearer access-2');
    expect(harness.state.record).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      accessTokenExpiresAt: '2030-01-01T00:15:00.000Z',
      membership: { status: 'active' },
      device: { status: 'active' },
    });
    expect(harness.clear).not.toHaveBeenCalled();
    expect(authorizationLost).not.toHaveBeenCalled();
    controller.dispose();

    const restartFetch = createFetchMock([heartbeatResponse('req-after-restart')]);
    const restartedController = createController(harness.store, restartFetch);

    const restartedState = await restartedController.initialize();

    expect(restartedState.phase).toBe(LicensePhase.Authorized);
    expect(requestAuthorization(restartFetch, 0)).toBe('Bearer access-2');
    restartedController.dispose();
  });

  test('deduplicates concurrent refreshes so a rotating refresh token is used once', async () => {
    const harness = createSessionStore(createAuthorizedSession());
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/license/heartbeat')) return heartbeatResponse('req-initialize');
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse({ accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 }, 'req-refresh');
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const controller = createController(harness.store, fetchMock);
    await controller.initialize();

    const [first, second] = await Promise.all([controller.refresh(), controller.refresh()]);

    expect(first.phase).toBe(LicensePhase.Authorized);
    expect(second.phase).toBe(LicensePhase.Authorized);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/refresh'))).toHaveLength(1);
    expect(harness.state.record).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      membership: { status: 'active' },
      device: { status: 'active' },
    });
    controller.dispose();
  });

  test('deduplicates concurrent activation submissions', async () => {
    const harness = createSessionStore(createAuthorizedSession({
      membership: { status: 'none' },
      device: null,
    }));
    const fetchMock = createFetchMock([
      jsonResponse({
        serverTime: '2030-01-01T00:00:00.000Z',
        entitlement: null,
        device: null,
      }, 'req-initialize'),
      jsonResponse({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        user: { uid: 'LN-1', phoneMasked: '138****0000', status: 'ACTIVE' },
        entitlement: {
          status: 'ACTIVE',
          version: 1,
          expiresAt: MEMBERSHIP_EXPIRES_AT,
          plan: { code: 'DAY' },
        },
        device: { status: 'ACTIVE', clientVersion: '1.0.0-test' },
      }, 'req-redeem'),
      heartbeatResponse('req-heartbeat'),
    ]);
    const controller = createController(harness.store, fetchMock);
    await controller.initialize();

    const [first, second] = await Promise.all([
      controller.redeem('LQGX-AAAA-BBBB-CCCC-DDDD'),
      controller.redeem('LQGX-AAAA-BBBB-CCCC-DDDD'),
    ]);

    expect(first.state.phase).toBe(LicensePhase.Authorized);
    expect(second.state.phase).toBe(LicensePhase.Authorized);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/license/redeem'))).toHaveLength(1);
    controller.dispose();
  });

  test('rejects a partial token pair without replacing or clearing the current session', async () => {
    const harness = createSessionStore(createAuthorizedSession());
    const fetchMock = createFetchMock([
      heartbeatResponse('req-initialize'),
      jsonResponse({ accessToken: 'access-without-refresh', expiresIn: 900 }, 'req-invalid-refresh'),
    ]);
    const controller = createController(harness.store, fetchMock);
    await controller.initialize();

    await expect(controller.refresh()).rejects.toMatchObject<Partial<LicenseApiError>>({
      status: 502,
      code: 'INVALID_REFRESH_RESPONSE',
    });

    expect(controller.getState().phase).toBe(LicensePhase.Authorized);
    expect(harness.state.record).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(harness.clear).not.toHaveBeenCalled();
    controller.dispose();
  });

  test('uses a valid signed offline lease for network failures without clearing credentials', async () => {
    const offline = createOfflineLease();
    const harness = createSessionStore(createAuthorizedSession({
      licenseCacheJws: offline.compactJws,
      offlineUntil: offline.offlineUntil,
      lastServerTime: offline.serverTime,
    }));
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const controller = createController(harness.store, fetchMock, { publicKeyPem: offline.publicKeyPem });

    const state = await controller.initialize();

    expect(state.phase).toBe(LicensePhase.OfflineGrace);
    expect(state.messageCode).toBe('OFFLINE_GRACE');
    expect(harness.clear).not.toHaveBeenCalled();
    controller.dispose();
  });

  test('clears the session and reports authorization loss for a terminal rejection', async () => {
    const harness = createSessionStore(createAuthorizedSession());
    const fetchMock = createFetchMock([errorResponse(403, 'DEVICE_SUSPENDED', 'req-suspended')]);
    const authorizationLost = vi.fn();
    const controller = createController(harness.store, fetchMock, { onAuthorizationLost: authorizationLost });

    const state = await controller.initialize();

    expect(state.phase).toBe(LicensePhase.Restricted);
    expect(state.messageCode).toBe('DEVICE_SUSPENDED');
    expect(harness.state.record).toBeNull();
    expect(harness.clear).toHaveBeenCalledOnce();
    expect(authorizationLost).toHaveBeenCalledOnce();
    expect(authorizationLost).toHaveBeenCalledWith('DEVICE_SUSPENDED');
    controller.dispose();
  });

  test('revokes the refresh session and stops the authorized runtime on logout', async () => {
    const harness = createSessionStore(createAuthorizedSession());
    const fetchMock = createFetchMock([
      heartbeatResponse('req-initialize'),
      jsonResponse({ ok: true }, 'req-logout'),
    ]);
    const authorizationLost = vi.fn();
    const controller = createController(harness.store, fetchMock, { onAuthorizationLost: authorizationLost });
    await controller.initialize();

    const state = await controller.logout();

    expect(state.phase).toBe(LicensePhase.SignedOut);
    expect(harness.state.record).toBeNull();
    expect(authorizationLost).toHaveBeenCalledOnce();
    expect(authorizationLost).toHaveBeenCalledWith('LOGOUT');
    const logoutCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/auth/logout'));
    expect(logoutCall).toBeDefined();
    expect(JSON.parse(String(logoutCall?.[1]?.body))).toEqual({ refreshToken: 'refresh-1' });
    controller.dispose();
  });

  test('does not authorize an active membership without the bound device', async () => {
    const harness = createSessionStore(createAuthorizedSession({ device: null }));
    const fetchMock = createFetchMock([jsonResponse({
      authorized: true,
      serverTime: '2030-01-01T00:00:00.000Z',
      entitlement: {
        status: 'ACTIVE',
        version: 1,
        expiresAt: MEMBERSHIP_EXPIRES_AT,
        plan: { code: 'MONTH' },
      },
      device: null,
    }, 'req-device-missing')]);
    const controller = createController(harness.store, fetchMock);

    const state = await controller.initialize();

    expect(state.phase).toBe(LicensePhase.Restricted);
    controller.dispose();
  });

  test('keeps rotated credentials in memory when persistence fails and retries them on the next heartbeat', async () => {
    const offline = createOfflineLease();
    const harness = createSessionStore(createAuthorizedSession({
      licenseCacheJws: offline.compactJws,
      offlineUntil: offline.offlineUntil,
      lastServerTime: offline.serverTime,
    }));
    let rejectedRotatedSave = false;
    harness.save.mockImplementation(async (record) => {
      if (record.accessToken === 'access-2' && !rejectedRotatedSave) {
        rejectedRotatedSave = true;
        throw new Error('secure storage unavailable');
      }
      harness.state.record = cloneRecord(record);
    });
    const fetchMock = createFetchMock([
      errorResponse(401, 'INVALID_ACCESS_TOKEN', 'req-expired'),
      jsonResponse({ accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 }, 'req-refresh'),
      heartbeatResponse('req-recovery'),
    ]);
    const controller = createController(harness.store, fetchMock, { publicKeyPem: offline.publicKeyPem });

    const degradedState = await controller.initialize();
    expect(degradedState.phase).toBe(LicensePhase.OfflineGrace);
    expect(harness.state.record).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    const recoveredState = await controller.heartbeat();

    expect(recoveredState.phase).toBe(LicensePhase.Authorized);
    expect(requestAuthorization(fetchMock, 2)).toBe('Bearer access-2');
    expect(harness.state.record).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    expect(harness.clear).not.toHaveBeenCalled();
    controller.dispose();
  });
});

function createController(
  sessionStore: LicenseSessionStore,
  fetchImpl: typeof fetch,
  overrides: Partial<{
    publicKeyPem: string;
    onAuthorizationLost: (reason: string) => void;
  }> = {},
): LicenseController {
  return new LicenseController({
    apiBaseUrl: API_BASE_URL,
    clientVersion: '1.0.0-test',
    deviceFingerprint: DEVICE_FINGERPRINT,
    sessionStore,
    fetchImpl,
    now: () => NOW_MS,
    ...overrides,
  });
}

function createAuthorizedSession(overrides: Partial<LicenseSessionRecord> = {}): LicenseSessionRecord {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    accessTokenExpiresAt: '2030-01-01T00:15:00.000Z',
    user: { uid: 'LN-1', phoneMasked: '138****0000', status: 'active' },
    membership: { status: 'active', planCode: 'MONTH', expiresAt: MEMBERSHIP_EXPIRES_AT, entitlementVersion: 1 },
    device: { status: 'active', clientVersion: '1.0.0-test' },
    lastServerTime: '2030-01-01T00:00:00.000Z',
    observedWallClockMs: NOW_MS,
    ...overrides,
  };
}

function createSessionStore(initial: LicenseSessionRecord | null) {
  const state: { record: LicenseSessionRecord | null } = {
    record: initial ? cloneRecord(initial) : null,
  };
  const load = vi.fn<LicenseSessionStore['load']>(async () => state.record ? cloneRecord(state.record) : null);
  const save = vi.fn<LicenseSessionStore['save']>(async (record) => {
    state.record = cloneRecord(record);
  });
  const clear = vi.fn<LicenseSessionStore['clear']>(async () => {
    state.record = null;
  });
  return { state, load, save, clear, store: { load, save, clear } satisfies LicenseSessionStore };
}

function createFetchMock(responses: Array<Response | Error>): typeof fetch & ReturnType<typeof vi.fn<typeof fetch>> {
  const queue = [...responses];
  const fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockImplementation(async () => {
    const response = queue.shift();
    if (!response) throw new Error('Unexpected license API request');
    if (response instanceof Error) throw response;
    return response;
  });
  return fetchMock;
}

function heartbeatResponse(requestId: string): Response {
  return jsonResponse({
    authorized: true,
    serverTime: '2030-01-01T00:00:00.000Z',
    offlineUntil: '2030-01-03T00:00:00.000Z',
    heartbeatAfterSeconds: 300,
    entitlement: {
      status: 'ACTIVE',
      version: 1,
      expiresAt: MEMBERSHIP_EXPIRES_AT,
      plan: { code: 'MONTH' },
    },
    device: { status: 'ACTIVE', clientVersion: '1.0.0-test' },
  }, requestId);
}

function jsonResponse(data: Record<string, unknown>, requestId: string): Response {
  return new Response(JSON.stringify({ data, requestId }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(status: number, code: string, requestId: string): Response {
  return new Response(JSON.stringify({
    error: { code, message: code, requestId },
    requestId,
  }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestAuthorization(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number): string | null {
  return new Headers(fetchMock.mock.calls[callIndex]?.[1]?.headers).get('authorization');
}

function cloneRecord(record: LicenseSessionRecord): LicenseSessionRecord {
  return JSON.parse(JSON.stringify(record)) as LicenseSessionRecord;
}

function createOfflineLease(): { compactJws: string; publicKeyPem: string; serverTime: string; offlineUntil: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const serverTime = '2030-01-01T00:00:00.000Z';
  const offlineUntil = '2030-01-03T00:00:00.000Z';
  const header = encode({ alg: 'EdDSA', typ: 'logicnest-license+jwt', kid: 'test' });
  const payload = encode({
    v: 1,
    iss: 'logicnest-license-server',
    aud: APP_USER_MODEL_ID,
    sub: 'LN-1',
    did: DEVICE_FINGERPRINT,
    sid: 'entitlement-1',
    userVersion: 1,
    deviceVersion: 1,
    entitlementVersion: 1,
    planCode: 'MONTH',
    membershipExpiresAt: MEMBERSHIP_EXPIRES_AT,
    iat: serverTime,
    serverTime,
    offlineUntil,
    heartbeatAfterSeconds: 300,
    jti: 'lease-1',
  });
  const signed = `${header}.${payload}`;
  const compactJws = `${signed}.${sign(null, Buffer.from(signed), privateKey).toString('base64url')}`;
  return {
    compactJws,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    serverTime,
    offlineUntil,
  };
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}
