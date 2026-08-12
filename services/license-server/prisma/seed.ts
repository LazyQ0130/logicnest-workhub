import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import type { AdminRole } from '@prisma/client';
import argon2 from 'argon2';
import { seedCatalog } from './catalogSeed.js';

const db = new PrismaClient();

const passwordOptions = { type: 2 as const, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

async function main() {
  const plans = [
    { code: 'DAY', name: '天卡', durationDays: 1 },
    { code: 'MONTH', name: '月卡', durationDays: 30 },
    { code: 'YEAR', name: '年卡', durationDays: 365 },
  ];
  for (const plan of plans) {
    await db.plan.upsert({ where: { code: plan.code }, update: { name: plan.name, durationDays: plan.durationDays }, create: { id: randomUUID(), ...plan } });
  }
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (username && password) {
    const existing = await db.admin.findUnique({ where: { username } });
    if (!existing) {
      await db.admin.create({ data: { id: randomUUID(), username, passwordHash: await argon2.hash(password, passwordOptions), role: 'SUPER_ADMIN', mustChangePassword: true } });
      console.log('[seed] bootstrap administrator created; change the password after first login');
    }
  }
  if (
    process.env.LOGICNEST_QA_E2E === '1'
    && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
  ) {
    await ensureQaAdmin('OPERATOR', process.env.QA_OPERATOR_USERNAME, process.env.QA_OPERATOR_PASSWORD);
    await ensureQaAdmin('AUDITOR', process.env.QA_AUDITOR_USERNAME, process.env.QA_AUDITOR_PASSWORD);
  }
  const catalogAdmin = await db.admin.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  if (catalogAdmin) {
    await seedCatalog(db, catalogAdmin, process.env.CATALOG_STORAGE_DIR || './catalog-storage');
  } else {
    console.warn('[seed] catalog skipped because no active administrator exists');
  }
}

async function ensureQaAdmin(role: AdminRole, usernameValue: string | undefined, password: string | undefined) {
  const username = usernameValue?.trim();
  if (!username || !password) return;
  const existing = await db.admin.findUnique({ where: { username } });
  if (existing) return;
  await db.admin.create({
    data: {
      id: randomUUID(),
      username,
      passwordHash: await argon2.hash(password, passwordOptions),
      role,
      mustChangePassword: false,
    },
  });
  console.log(`[seed] QA ${role.toLowerCase()} account created`);
}

main().catch((error) => { console.error('[seed] failed', error); process.exitCode = 1; }).finally(() => db.$disconnect());
