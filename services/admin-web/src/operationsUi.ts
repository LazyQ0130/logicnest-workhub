import { Permission } from './api/types';

export const OPERATIONS_NAV_ITEMS = [
  { key: '/dashboard', label: '运营概览', permission: Permission.DashboardRead },
  { key: '/users', label: '用户', permission: Permission.UsersRead },
  { key: '/plans', label: '会员与卡密', permission: Permission.PlansRead },
  { key: '/devices', label: '设备', permission: Permission.DevicesRead },
  { key: '/catalog', label: '功能发布', permission: Permission.CatalogRead },
  { key: '/desktop-releases', label: '桌面版本', permission: Permission.DesktopReleasesRead },
  { key: '/audit-logs', label: '审计', permission: Permission.AuditLogsRead },
] as const;

export const OPERATIONS_PAGE_TITLES = Object.fromEntries(
  OPERATIONS_NAV_ITEMS.map((item) => [item.key, item.label]),
) as Record<string, string>;
