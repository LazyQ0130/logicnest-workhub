import { apiClient } from './client';
import type {
  AccountStatus,
  AuditLogRecord,
  AuthResponse,
  CatalogKind,
  CatalogRelease,
  CatalogReleaseStatus,
  DashboardStats,
  DesktopRelease,
  DesktopReleaseStatus,
  DeviceStatus,
  GenerateKeysResponse,
  LicenseKeyRecord,
  LicenseKeyStatus,
  ManagedDevice,
  ManagedUser,
  MembershipPlan,
  PageResponse,
  PlanStatus,
  QueryValue,
} from './types';

function queryString(values: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const adminApi = {
  login(username: string, password: string) {
    return apiClient.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { username, password },
      skipCsrf: true,
    });
  },

  me() {
    return apiClient.request<AuthResponse>('/auth/me');
  },

  changePassword(currentPassword: string, newPassword: string) {
    return apiClient.request<void>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
  },

  logout() {
    return apiClient.request<void>('/auth/logout', { method: 'POST' });
  },

  dashboard() {
    return apiClient.request<DashboardStats>('/dashboard');
  },

  users(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: AccountStatus;
  }) {
    return apiClient.request<PageResponse<ManagedUser>>(
      `/users${queryString(params)}`,
    );
  },

  user(id: string) {
    return apiClient.request<ManagedUser>(`/users/${encodeURIComponent(id)}`);
  },

  setUserStatus(id: string, status: AccountStatus, reason?: string) {
    return apiClient.request<ManagedUser>(
      `/users/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: { status, reason } },
    );
  },

  resetUserPassword(id: string, newPassword: string) {
    return apiClient.request<void>(
      `/users/${encodeURIComponent(id)}/reset-password`,
      { method: 'POST', body: { newPassword } },
    );
  },

  unbindUserDevice(id: string, deviceId?: string, reason?: string) {
    return apiClient.request<void>(
      `/users/${encodeURIComponent(id)}/unbind-device`,
      { method: 'POST', body: { deviceId, reason } },
    );
  },

  plans() {
    return apiClient.request<MembershipPlan[]>('/plans');
  },

  createPlan(input: { code: string; name: string; durationDays: number }) {
    return apiClient.request<MembershipPlan>('/plans', {
      method: 'POST',
      body: input,
    });
  },

  updatePlan(
    id: string,
    input: { name?: string; durationDays?: number; status?: PlanStatus },
  ) {
    return apiClient.request<MembershipPlan>(
      `/plans/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: input },
    );
  },

  deletePlan(id: string) {
    return apiClient.request<void>(`/plans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  licenseKeys(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: LicenseKeyStatus;
    planId?: string;
    batchId?: string;
  }) {
    return apiClient.request<PageResponse<LicenseKeyRecord>>(
      `/license-keys${queryString(params)}`,
    );
  },

  generateLicenseKeys(input: {
    planId: string;
    count: number;
    expiresAt?: string;
  }) {
    return apiClient.request<GenerateKeysResponse>('/license-keys/batches', {
      method: 'POST',
      body: input,
    });
  },

  revokeLicenseKey(id: string, reason?: string) {
    return apiClient.request<void>(
      `/license-keys/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: { status: 'REVOKED', reason } },
    );
  },

  devices(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: DeviceStatus;
    online?: boolean;
  }) {
    return apiClient.request<PageResponse<ManagedDevice>>(
      `/devices${queryString(params)}`,
    );
  },

  setDeviceStatus(id: string, status: AccountStatus, reason?: string) {
    return apiClient.request<ManagedDevice>(
      `/devices/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: { status, reason } },
    );
  },

  unbindDevice(id: string, reason?: string) {
    return apiClient.request<void>(`/devices/${encodeURIComponent(id)}/unbind`, {
      method: 'POST',
      body: { reason },
    });
  },

  invalidateDeviceSessions(id: string, reason?: string) {
    return apiClient.request<void>(
      `/devices/${encodeURIComponent(id)}/invalidate-sessions`,
      { method: 'POST', body: { reason } },
    );
  },

  auditLogs(params: {
    page: number;
    pageSize: number;
    actorType?: string;
    action?: string;
    targetType?: string;
  }) {
    return apiClient.request<PageResponse<AuditLogRecord>>(
      `/audit-logs${queryString(params)}`,
    );
  },

  catalogItems(params: { kind?: CatalogKind; status?: CatalogReleaseStatus }) {
    return apiClient.request<{ items: CatalogRelease[] }>(`/catalog/items${queryString(params)}`);
  },

  importCatalog(file: File) {
    const body = new FormData();
    body.append('archive', file, file.name);
    return apiClient.request<{ items: CatalogRelease[] }>('/catalog/import', { method: 'POST', body });
  },

  updateCatalogRelease(releaseId: string, input: Partial<Pick<CatalogRelease,
    'nameZh' | 'nameEn' | 'descriptionZh' | 'descriptionEn' | 'sortOrder' | 'tags' | 'metadata'>>) {
    return apiClient.request<CatalogRelease>(`/catalog/releases/${encodeURIComponent(releaseId)}`, { method: 'PATCH', body: input });
  },

  publishCatalogReleases(releaseIds: string[]) {
    return apiClient.request<{ items: CatalogRelease[] }>('/catalog/releases/publish', { method: 'POST', body: { releaseIds } });
  },

  archiveCatalogReleases(releaseIds: string[]) {
    return apiClient.request<{ archived: number }>('/catalog/releases/archive', { method: 'POST', body: { releaseIds } });
  },

  desktopReleases(params: { platform?: string; arch?: string; status?: DesktopReleaseStatus } = {}) {
    return apiClient.request<{ items: DesktopRelease[] }>(`/desktop-releases${queryString(params)}`);
  },

  uploadDesktopRelease(input: {
    version: string;
    platform: string;
    arch: string;
    changeLogZh: { title: string; content: string[] };
    changeLogEn: { title: string; content: string[] };
    file: File;
  }) {
    const body = new FormData();
    body.append('version', input.version);
    body.append('platform', input.platform);
    body.append('arch', input.arch);
    body.append('changeLogZh', JSON.stringify(input.changeLogZh));
    body.append('changeLogEn', JSON.stringify(input.changeLogEn));
    body.append('file', input.file, input.file.name);
    return apiClient.request<DesktopRelease>('/desktop-releases', { method: 'POST', body });
  },

  updateDesktopRelease(id: string, input: Partial<Pick<DesktopRelease, 'changeLogZh' | 'changeLogEn'>>) {
    return apiClient.request<DesktopRelease>(`/desktop-releases/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
  },

  publishDesktopRelease(id: string) {
    return apiClient.request<DesktopRelease>(`/desktop-releases/${encodeURIComponent(id)}/publish`, { method: 'POST' });
  },

  withdrawDesktopRelease(id: string) {
    return apiClient.request<DesktopRelease>(`/desktop-releases/${encodeURIComponent(id)}/withdraw`, { method: 'POST' });
  },
};

export { queryString };
