import { describe, expect, test, vi } from 'vitest';

import { LicenseApiClient, LicenseApiError } from './licenseApiClient';

describe('LicenseApiClient', () => {
  test('maps desktop registration and server response contracts', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: {
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { uid: 'LN-1', phoneMasked: '138****0000', status: 'ACTIVE' },
        entitlement: { status: 'ACTIVE', version: 4, expiresAt: '2026-09-01T00:00:00.000Z', plan: { code: 'MONTH' } },
        device: { status: 'ACTIVE', lastSeenAt: '2026-08-02T00:00:00.000Z' },
        offlineLicenseJws: 'header.payload.signature',
        heartbeatAfterSeconds: 300,
      },
      requestId: 'req-1',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new LicenseApiClient({ baseUrl: 'https://license.example/api/v1/', fetchImpl: fetchMock });

    const result = await client.register({
      phone: '13800000000',
      password: 'password-1',
      passwordConfirmation: 'password-1',
      deviceFingerprint: 'device-fingerprint',
      clientVersion: '1.0.0-test',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://license.example/api/v1/auth/register');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      phone: '13800000000', password: 'password-1', confirmPassword: 'password-1',
      deviceFingerprint: 'device-fingerprint', clientVersion: '1.0.0-test',
    });
    expect(result).toMatchObject({
      user: { uid: 'LN-1', status: 'active' },
      membership: { status: 'active', planCode: 'MONTH', entitlementVersion: 4 },
      device: { status: 'active', lastOnlineAt: '2026-08-02T00:00:00.000Z' },
      licenseCacheJws: 'header.payload.signature',
      heartbeatAfterSeconds: 300,
      requestId: 'req-1',
    });
  });

  test('preserves structured error code and request id', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'LICENSE_ALREADY_BOUND', message: '卡密已绑定', requestId: 'req-error' },
    }), { status: 409, headers: { 'content-type': 'application/json' } }));
    const client = new LicenseApiClient({ baseUrl: 'https://license.example/api/v1', fetchImpl: fetchMock });

    await expect(client.redeem('token', {
      code: 'LQGX-AAAA-BBBB-CCCC-DDDD', deviceFingerprint: 'device', clientVersion: '1.0.0',
    })).rejects.toMatchObject<Partial<LicenseApiError>>({
      status: 409, code: 'LICENSE_ALREADY_BOUND', requestId: 'req-error',
    });
  });

  test('maps a refresh response that contains only the rotated token pair', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: {
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        expiresIn: 900,
      },
      requestId: 'req-refresh',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new LicenseApiClient({ baseUrl: 'https://license.example/api/v1', fetchImpl: fetchMock });

    const result = await client.refresh('refresh-1', 'device-fingerprint');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://license.example/api/v1/auth/refresh');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      refreshToken: 'refresh-1', deviceFingerprint: 'device-fingerprint',
    });
    expect(result).toEqual({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresIn: 900,
      requestId: 'req-refresh',
    });
  });

  test('sends the refresh token when logging out so the server session is revoked', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const client = new LicenseApiClient({ baseUrl: 'https://license.example/api/v1', fetchImpl: fetchMock });

    await client.logout('access-1', 'refresh-1');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://license.example/api/v1/auth/logout');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Bearer access-1' });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ refreshToken: 'refresh-1' });
  });

  test('distinguishes explicitly empty login state from fields omitted by refresh', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: {
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { uid: 'LN-1', phoneMasked: '138****0000', status: 'ACTIVE' },
        entitlement: null,
        device: null,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new LicenseApiClient({ baseUrl: 'https://license.example/api/v1', fetchImpl: fetchMock });

    const result = await client.login({
      phone: '+8613800000000',
      password: 'password-1',
      deviceFingerprint: 'device-fingerprint',
      clientVersion: '1.0.0',
    });

    expect(result).toMatchObject({
      membership: { status: 'none' },
      device: null,
    });
  });
});
