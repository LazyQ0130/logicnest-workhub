import { describe, expect, test } from 'vitest';

import { serializeAuditLog } from '../src/services/adminService.js';

describe('serializeAuditLog', () => {
  test('converts the Prisma bigint id into a JSON-safe string', () => {
    const auditLog = serializeAuditLog({
      id: 42n,
      action: 'admin.change_password',
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(auditLog.id).toBe('42');
    expect(() => JSON.stringify(auditLog)).not.toThrow();
  });
});
