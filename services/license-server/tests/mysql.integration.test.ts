import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, test } from 'vitest';

// This suite is intentionally opt-in. Point TEST_DATABASE_URL at an isolated
// MySQL 8 database, run `DATABASE_URL=... npx prisma migrate deploy`, then run
// `npm run test:mysql`. It never falls back to the application's DATABASE_URL.
const enabled = Boolean(process.env.TEST_DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const database = enabled
  ? new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
  : null;

afterAll(async () => {
  await database?.$disconnect();
});

suite('MySQL license API integration (opt-in)', () => {
  test('requires an explicitly isolated test database', () => {
    expect(process.env.TEST_DATABASE_URL).toMatch(/^mysql:\/\//);
    expect(process.env.TEST_DATABASE_URL).not.toBe(process.env.DATABASE_URL);
  });

  test('runs migrations and persists a user-device relation in real MySQL', async () => {
    expect(database).not.toBeNull();
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const userId = randomUUID();
    const deviceId = randomUUID();
    const user = await database!.user.create({
      data: {
        id: userId,
        uid: `LN-IT-${suffix}`,
        phoneNormalized: `+869${suffix.slice(0, 10)}`,
        phoneLast4: suffix.slice(-4),
        passwordHash: 'integration-test-not-a-real-password-hash',
        devices: {
          create: {
            id: deviceId,
            fingerprintDigest: suffix.padEnd(64, '0'),
            fingerprintHint: suffix.slice(-8),
            clientVersion: 'mysql-integration',
          },
        },
      },
      include: { devices: true },
    });

    const persisted = await database!.user.findUnique({
      where: { id: user.id },
      include: { devices: true },
    });
    expect(persisted).toMatchObject({
      id: userId,
      devices: [{ id: deviceId, clientVersion: 'mysql-integration' }],
    });
  });
});
