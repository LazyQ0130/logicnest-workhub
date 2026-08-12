import { describe, expect, test } from 'vitest';

import { Permission } from './api/types';
import { OPERATIONS_NAV_ITEMS } from './operationsUi';

describe('operations center navigation', () => {
  test('keeps routes and permissions while using the brand navigation labels', () => {
    expect(OPERATIONS_NAV_ITEMS).toEqual(expect.arrayContaining([
      { key: '/dashboard', label: '运营概览', permission: Permission.DashboardRead },
      { key: '/users', label: '用户', permission: Permission.UsersRead },
      { key: '/plans', label: '会员与卡密', permission: Permission.PlansRead },
      { key: '/devices', label: '设备', permission: Permission.DevicesRead },
      { key: '/catalog', label: '功能发布', permission: Permission.CatalogRead },
      { key: '/audit-logs', label: '审计', permission: Permission.AuditLogsRead },
    ]));
    expect(OPERATIONS_NAV_ITEMS).toHaveLength(7);
    expect(OPERATIONS_NAV_ITEMS).toContainEqual(expect.objectContaining({
      key: '/desktop-releases',
      permission: Permission.DesktopReleasesRead,
    }));
  });
});

