import { generateKeyPairSync } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, test, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { parseConfig } from '../src/config.js';
import type { ClientService } from '../src/services/clientService.js';
import type { AdminService } from '../src/services/adminService.js';

const pair = generateKeyPairSync('ed25519');
const config = parseConfig({
  NODE_ENV: 'test', DATABASE_URL: 'mysql://test:test@127.0.0.1:3306/test', ALLOWED_ORIGINS: 'http://localhost:5176',
  JWT_SECRET: 'j'.repeat(40), REFRESH_TOKEN_HMAC_SECRET: 'r'.repeat(40), ADMIN_SESSION_HMAC_SECRET: 'a'.repeat(40),
  CARD_HMAC_SECRET: 'c'.repeat(40), DEVICE_HMAC_SECRET: 'd'.repeat(40), IP_HMAC_SECRET: 'i'.repeat(40),
  LICENSE_JWS_PRIVATE_KEY_B64: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  LICENSE_JWS_PUBLIC_KEY_B64: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
});

const admin = { id: '00000000-0000-4000-8000-000000000001', username: 'owner', role: 'SUPER_ADMIN', status: 'ACTIVE', mustChangePassword: false, createdAt: new Date(), lastLoginAt: null } as const;
const fakeDb = {
  $queryRaw: async () => [{ one: 1 }],
  $disconnect: async () => undefined,
  admin: { findUnique: async () => admin },
} as unknown as PrismaClient;

const clientStub = {
  register: async () => ({ user: { id: 'u1', uid: 'LN-1', phone: '+86******8000', status: 'ACTIVE', createdAt: new Date(), lastLoginAt: null } }),
  login: async () => ({ accessToken: 'access', refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 900, user: { id: 'u1' }, device: null, entitlement: null }),
  refresh: async () => ({ accessToken: 'access2', refreshToken: 'refresh2', tokenType: 'Bearer', expiresIn: 900 }),
  logout: async () => ({ ok: true }),
  status: async () => ({ user: { id: 'u1' }, entitlement: null, devices: [] }),
  redeem: async () => ({ idempotent: false, entitlement: null, device: null, offlineLicenseJws: 'jws', licenseKeyId: 'kid' }),
  heartbeat: async () => ({ authorized: true, serverTime: new Date().toISOString(), nextHeartbeatAt: new Date().toISOString(), entitlement: null, device: null, offlineLicenseJws: 'jws', licenseKeyId: 'kid' }),
} as unknown as ClientService;

const adminStub = {
  login: async () => ({ sessionToken: 's'.repeat(48), csrfToken: 'c'.repeat(32), admin }),
  authenticate: async () => ({ admin, sessionId: 'session-1', csrfToken: 'c'.repeat(32) }),
  logout: async () => ({ ok: true }),
  changePassword: async () => ({ sessionToken: 's'.repeat(48), csrfToken: 'c'.repeat(32), admin: { ...admin, mustChangePassword: false } }),
  dashboard: async () => ({ registeredUsers: 0, activeEntitlements: 0, newUsersToday: 0, onlineDevices: 0, expiringSoon: 0 }),
} as unknown as AdminService;

describe('Fastify API boundary', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    app = await buildApp(config, { db: fakeDb, clientService: clientStub, adminService: adminStub });
  });

  test('health and security headers include request id', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/live', headers: { 'x-request-id': 'test-request-1' } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('test-request-1');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  test('validation errors are structured and do not echo secrets', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { phone: 'bad', password: 'short', confirmPassword: 'short' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_PHONE' } });
    expect(response.body).not.toContain('short');
  });

  test('client login and refresh return token pair shape', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { phone: '13800138000', password: 'long-password' } });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ accessToken: 'access', refreshToken: 'refresh', tokenType: 'Bearer' });
    const refresh = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: 'refresh-token-at-least-20' } });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toMatchObject({ accessToken: 'access2', refreshToken: 'refresh2' });
  });

  test('admin login requires an allowlisted origin and sets secure cookie names', async () => {
    const denied = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { username: 'owner', password: 'password' } });
    expect(denied.statusCode).toBe(403);
    const login = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', headers: { origin: 'http://localhost:5176' }, payload: { username: 'owner', password: 'password' } });
    expect(login.statusCode).toBe(200);
    expect(String(login.headers['set-cookie'])).toContain('ln_admin_session=');
    expect(String(login.headers['set-cookie'])).toContain('ln_admin_csrf=');
  });

  test('unknown routes and disallowed CORS origins are rejected', async () => {
    const missing = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(missing.statusCode).toBe(404);
    const cors = await app.inject({ method: 'OPTIONS', url: '/api/v1/auth/me', headers: { origin: 'https://evil.invalid', 'access-control-request-method': 'GET' } });
    expect(cors.statusCode).toBe(403);
    expect(cors.json()).toMatchObject({ error: { code: 'ORIGIN_FORBIDDEN' } });
  });

  test('preserves a rate-limit response as HTTP 429 instead of rewriting it to 500', async () => {
    const limitedConfig = { ...config, qaE2e: false };
    const limitedApp = await buildApp(limitedConfig, { db: fakeDb, clientService: clientStub, adminService: adminStub });
    let lastResponse;
    for (let index = 0; index < 9; index += 1) {
      lastResponse = await limitedApp.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { phone: '13800138000', password: 'long-password', confirmPassword: 'long-password' },
      });
    }
    expect(lastResponse?.statusCode).toBe(429);
    expect(lastResponse?.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    await limitedApp.close();
  });

  test('enforces operator and auditor permission boundaries', async () => {
    const serviceForRole = (role: 'OPERATOR' | 'AUDITOR') => ({
      authenticate: async () => ({
        admin: { ...admin, role },
        sessionId: `session-${role.toLowerCase()}`,
        csrfToken: 'c'.repeat(32),
      }),
      listAuditLogs: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
    }) as unknown as AdminService;

    const operatorApp = await buildApp(config, {
      db: fakeDb,
      clientService: clientStub,
      adminService: serviceForRole('OPERATOR'),
    });
    const operatorAudit = await operatorApp.inject({ method: 'GET', url: '/api/v1/admin/audit-logs' });
    expect(operatorAudit.statusCode).toBe(403);
    await operatorApp.close();

    const auditorApp = await buildApp(config, {
      db: fakeDb,
      clientService: clientStub,
      adminService: serviceForRole('AUDITOR'),
    });
    const auditorAudit = await auditorApp.inject({ method: 'GET', url: '/api/v1/admin/audit-logs' });
    expect(auditorAudit.statusCode).toBe(200);
    const auditorWrite = await auditorApp.inject({
      method: 'POST',
      url: '/api/v1/admin/plans',
      payload: { code: 'QA', name: 'QA', durationDays: 1 },
    });
    expect(auditorWrite.statusCode).toBe(403);
    await auditorApp.close();
  });
});
