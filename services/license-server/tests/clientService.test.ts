import type { PrismaClient, User } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hash: vi.fn(async () => 'password-hash'),
  writeAudit: vi.fn(async () => undefined),
}));

vi.mock('argon2', () => ({
  default: {
    hash: mocks.hash,
    verify: vi.fn(async () => true),
  },
}));

vi.mock('../src/audit.js', () => ({
  writeAudit: mocks.writeAudit,
}));

import type { AppConfig } from '../src/config.js';
import { ClientService } from '../src/services/clientService.js';

const config = {
  deviceHmacSecret: 'd'.repeat(40),
} as AppConfig;

const request = {
  id: 'request-1',
  ip: '127.0.0.1',
} as FastifyRequest;

const user: User = {
  id: 'user-1',
  uid: 'LN-USER-1',
  phoneNormalized: '+8613800138000',
  phoneLast4: '8000',
  passwordHash: 'password-hash',
  status: 'ACTIVE',
  tokenVersion: 1,
  createdAt: new Date('2026-08-05T00:00:00.000Z'),
  updatedAt: new Date('2026-08-05T00:00:00.000Z'),
  lastLoginAt: null,
  passwordResetAt: null,
};

describe('ClientService registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('rejects a device bound to another account before creating the user', async () => {
    const harness = createDatabaseHarness({ userId: 'other-user', status: 'ACTIVE' });
    const service = new ClientService(harness.db, config);

    await expect(service.register({
      phone: '13800138000',
      password: 'password-1',
      confirmPassword: 'password-1',
      deviceFingerprint: 'device-fingerprint',
      clientVersion: '1.0.0-test',
    }, request)).rejects.toMatchObject({
      statusCode: 403,
      code: 'DEVICE_NOT_BOUND',
    });

    expect(harness.userCreate).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  test('creates the account and audit record when the device is available', async () => {
    const harness = createDatabaseHarness(null);
    const service = new ClientService(harness.db, config);

    const result = await service.register({
      phone: '13800138000',
      password: 'password-1',
      confirmPassword: 'password-1',
      deviceFingerprint: 'device-fingerprint',
      clientVersion: '1.0.0-test',
    }, request);

    expect(result).toMatchObject({ user: { uid: 'LN-USER-1', phone: '+86******8000' } });
    expect(harness.userCreate).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      harness.transactionClient,
      config,
      request,
      expect.objectContaining({ action: 'user.register', targetId: user.id }),
    );
  });
});

function createDatabaseHarness(device: { userId: string | null; status: 'ACTIVE' | 'SUSPENDED' | 'UNBOUND' } | null) {
  const userFindUnique = vi.fn(async () => null);
  const userCreate = vi.fn(async () => user);
  const deviceFindUnique = vi.fn(async () => device);
  const transactionClient = {
    user: { findUnique: userFindUnique, create: userCreate },
    device: { findUnique: deviceFindUnique },
  };
  const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient));
  const db = { $transaction: transaction } as unknown as PrismaClient;
  return { db, transactionClient, userCreate };
}
