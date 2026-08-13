export const AdminRole = {
  SuperAdmin: 'SUPER_ADMIN',
  Operator: 'OPERATOR',
  Auditor: 'AUDITOR',
} as const;

export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole] | string;

export const Permission = {
  DashboardRead: 'dashboard:read',
  UsersRead: 'users:read',
  UsersWrite: 'users:write',
  PlansRead: 'plans:read',
  PlansWrite: 'plans:write',
  LicenseKeysRead: 'license-keys:read',
  LicenseKeysWrite: 'license-keys:write',
  DevicesRead: 'devices:read',
  DevicesWrite: 'devices:write',
  AuditLogsRead: 'audit-logs:read',
  CatalogRead: 'catalog:read',
  CatalogWrite: 'catalog:write',
  DesktopReleasesRead: 'desktop-releases:read',
  DesktopReleasesWrite: 'desktop-releases:write',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export interface AdminAccount {
  id: string;
  username: string;
  role: AdminRole;
  mustChangePassword: boolean;
  permissions?: Permission[];
}

export interface AuthResponse {
  admin: AdminAccount;
  csrfToken: string;
}

export interface PageResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardStats {
  registeredUsers: number;
  activeEntitlements: number;
  newUsersToday: number;
  onlineDevices: number;
  expiringSoon: number;
}

export const AccountStatus = {
  Active: 'ACTIVE',
  Suspended: 'SUSPENDED',
} as const;

export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const DeviceStatus = {
  Active: 'ACTIVE',
  Suspended: 'SUSPENDED',
  Unbound: 'UNBOUND',
} as const;

export type DeviceStatus = (typeof DeviceStatus)[keyof typeof DeviceStatus];

export interface MembershipSummary {
  id?: string;
  status: string;
  planName?: string;
  planCode?: string;
  plan?: string | { id?: string; code?: string; name?: string };
  startsAt?: string | null;
  expiresAt?: string | null;
}

export interface DeviceSummary {
  id: string;
  fingerprintDigest?: string;
  fingerprintPreview?: string;
  fingerprintHint?: string;
  status: DeviceStatus;
  boundAt?: string | null;
  lastSeenAt?: string | null;
  clientVersion?: string | null;
  lastIp?: string | null;
  online?: boolean;
}

export interface ManagedUser {
  id: string;
  uid: string;
  phone: string;
  status: AccountStatus;
  registeredAt?: string;
  createdAt?: string;
  lastLoginAt?: string | null;
  lastSeenAt?: string | null;
  lastOnlineAt?: string | null;
  clientVersion?: string | null;
  membership?: MembershipSummary | null;
  entitlement?: MembershipSummary | null;
  devices?: DeviceSummary[];
}

export const PlanStatus = {
  Active: 'ACTIVE',
  Disabled: 'DISABLED',
} as const;

export type PlanStatus = (typeof PlanStatus)[keyof typeof PlanStatus];

export interface MembershipPlan {
  id: string;
  code: string;
  name: string;
  durationDays: number;
  status: PlanStatus;
  createdAt?: string;
  updatedAt?: string;
  _count?: { licenseKeys?: number; entitlements?: number };
}

export const LicenseKeyStatus = {
  Unused: 'UNUSED',
  Redeemed: 'REDEEMED',
  Revoked: 'REVOKED',
  Expired: 'EXPIRED',
} as const;

export type LicenseKeyStatus =
  (typeof LicenseKeyStatus)[keyof typeof LicenseKeyStatus];

export interface LicenseKeyRecord {
  id: string;
  maskedCode?: string;
  codePreview?: string;
  lastFour?: string;
  status: LicenseKeyStatus;
  planId: string;
  planName?: string;
  plan?: { id?: string; code?: string; name?: string };
  batchId: string;
  createdAt: string;
  expiresAt?: string | null;
  redeemedAt?: string | null;
  redeemedByUid?: string | null;
  revokedAt?: string | null;
}

export interface LicenseKeyBatch {
  id: string;
  planId: string;
  count: number;
  createdAt: string;
  expiresAt?: string | null;
}

export interface GeneratedLicenseKey {
  id?: string;
  code: string;
  planId?: string;
  planName?: string;
  expiresAt?: string | null;
}

export interface GenerateKeysResponse {
  batch: LicenseKeyBatch;
  keys: Array<GeneratedLicenseKey | string>;
  csv?: string;
}

export interface ManagedDevice extends DeviceSummary {
  uid?: string;
  user?: { id?: string; uid?: string; phone?: string } | null;
  maskedPhone?: string;
  sessionVersion?: number;
  createdAt?: string;
}

export interface AuditLogRecord {
  id: string;
  createdAt: string;
  actorType: string;
  actorId?: string | null;
  actorUsername?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  result?: string;
  ipAddress?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface QueryPage {
  page: number;
  pageSize: number;
}

export type QueryValue = string | number | boolean | null | undefined;

export const CatalogKind = { Skill: 'SKILL', Kit: 'KIT', Connector: 'CONNECTOR' } as const;
export type CatalogKind = (typeof CatalogKind)[keyof typeof CatalogKind];

export const CatalogReleaseStatus = { Draft: 'DRAFT', Published: 'PUBLISHED', Archived: 'ARCHIVED' } as const;
export type CatalogReleaseStatus = (typeof CatalogReleaseStatus)[keyof typeof CatalogReleaseStatus];

export interface CatalogRelease {
  id: string;
  releaseId: string;
  kind: CatalogKind;
  slug: string;
  version: string;
  nameZh: string;
  nameEn?: string | null;
  descriptionZh: string;
  descriptionEn?: string | null;
  sortOrder: number;
  tags: string[];
  metadata: Record<string, unknown>;
  status: CatalogReleaseStatus;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assets: Array<{ role: string; originalName: string; mimeType: string; sizeBytes: number; sha256: string }>;
}

export const DesktopReleaseStatus = {
  Draft: 'DRAFT', Published: 'PUBLISHED', Withdrawn: 'WITHDRAWN', Archived: 'ARCHIVED',
} as const;
export type DesktopReleaseStatus = (typeof DesktopReleaseStatus)[keyof typeof DesktopReleaseStatus];

export interface DesktopRelease {
  id: string;
  version: string;
  platform: string;
  arch: string;
  changeLogZh: { title: string; content: string[] };
  changeLogEn: { title: string; content: string[] };
  status: DesktopReleaseStatus;
  publishedAt?: string | null;
  withdrawnAt?: string | null;
  createdAt: string;
  updatedAt: string;
  asset: { id: string; originalName: string; mimeType: string; sizeBytes: number; sha256: string } | null;
}
