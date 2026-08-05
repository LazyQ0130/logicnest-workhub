import { describe, expect, test } from 'vitest';

import { Permission } from './api/types';
import { OPERATIONS_NAV_ITEMS } from './operationsUi';

describe('operations center navigation', () => {
  test('keeps routes and permissions while using the brand navigation labels', () => {
    expect(OPERATIONS_NAV_ITEMS).toEqual([
      { key: '/dashboard', label: '运营概览', permission: Permission.DashboardRead },
      { key: '/users', label: '用户', permission: Permission.UsersRead },
      { key: '/plans', label: '会员与卡密', permission: Permission.PlansRead },
      { key: '/devices', label: '设备', permission: Permission.DevicesRead },
      { key: '/audit-logs', label: '审计', permission: Permission.AuditLogsRead },
    ]);
  });
});

