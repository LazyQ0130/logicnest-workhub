import { describe, expect, it } from 'vitest';
import { hasRolePermission } from './AuthContext';
import { AdminRole, Permission, type AdminAccount } from '../api/types';

const account = (role: AdminAccount['role']): AdminAccount => ({
  id: 'admin-1',
  username: 'operator',
  role,
  mustChangePassword: false,
});

describe('admin role permissions', () => {
  it('gives super admins all MVP permissions', () => {
    expect(hasRolePermission(account(AdminRole.SuperAdmin), Permission.AuditLogsRead)).toBe(true);
    expect(hasRolePermission(account(AdminRole.SuperAdmin), Permission.DevicesWrite)).toBe(true);
  });

  it('keeps auditors read-only', () => {
    expect(hasRolePermission(account(AdminRole.Auditor), Permission.UsersRead)).toBe(true);
    expect(hasRolePermission(account(AdminRole.Auditor), Permission.UsersWrite)).toBe(false);
    expect(hasRolePermission(account(AdminRole.Auditor), Permission.LicenseKeysWrite)).toBe(false);
  });

  it('keeps operators out of audit logs while allowing operational mutations', () => {
    expect(hasRolePermission(account(AdminRole.Operator), Permission.UsersWrite)).toBe(true);
    expect(hasRolePermission(account(AdminRole.Operator), Permission.DevicesWrite)).toBe(true);
    expect(hasRolePermission(account(AdminRole.Operator), Permission.AuditLogsRead)).toBe(false);
  });
});
