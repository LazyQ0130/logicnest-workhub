import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { App, Spin } from 'antd';
import {
  AUTH_EXPIRED_EVENT,
  ApiError,
  clearAuthenticatedSession,
  markAuthenticatedSession,
} from '../api/client';
import { adminApi } from '../api/adminApi';
import {
  AdminRole,
  Permission,
  type AdminAccount,
} from '../api/types';

const ALL_PERMISSIONS = Object.values(Permission);
const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  [AdminRole.SuperAdmin]: ALL_PERMISSIONS,
  [AdminRole.Operator]: [
    Permission.DashboardRead,
    Permission.UsersRead,
    Permission.UsersWrite,
    Permission.PlansRead,
    Permission.PlansWrite,
    Permission.LicenseKeysRead,
    Permission.LicenseKeysWrite,
    Permission.DevicesRead,
    Permission.DevicesWrite,
    Permission.CatalogRead,
    Permission.CatalogWrite,
    Permission.DesktopReleasesRead,
    Permission.DesktopReleasesWrite,
  ],
  [AdminRole.Auditor]: [
    Permission.DashboardRead,
    Permission.UsersRead,
    Permission.PlansRead,
    Permission.LicenseKeysRead,
    Permission.DevicesRead,
    Permission.AuditLogsRead,
    Permission.CatalogRead,
    Permission.DesktopReleasesRead,
  ],
};

interface AuthContextValue {
  admin: AdminAccount | null;
  loading: boolean;
  login(username: string, password: string): Promise<AdminAccount>;
  logout(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  refresh(): Promise<AdminAccount | null>;
  hasPermission(permission: Permission): boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function permissionsFor(admin: AdminAccount): readonly Permission[] {
  if (admin.permissions?.length) return admin.permissions;
  const role = String(admin.role).toUpperCase();
  return ROLE_PERMISSIONS[role] || [];
}

export function AuthProvider({ children }: PropsWithChildren) {
  const { message } = App.useApp();
  const [admin, setAdmin] = useState<AdminAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await adminApi.me();
      markAuthenticatedSession();
      setAdmin(response.admin);
      return response.admin;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        // A transient network error should not silently make a signed-in
        // operator appear logged out. The next route action can retry.
        if (!(error instanceof ApiError) || error.code !== 'NETWORK_ERROR') {
          setAdmin(null);
        }
      } else {
        setAdmin(null);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refresh().finally(() => {
      if (active) setLoading(false);
    });
    const onExpired = () => {
      setAdmin(null);
      message.warning('登录已失效，请重新登录');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => {
      active = false;
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    };
  }, [message, refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await adminApi.login(username, password);
    markAuthenticatedSession();
    setAdmin(response.admin);
    return response.admin;
  }, []);

  const logout = useCallback(async () => {
    clearAuthenticatedSession();
    try {
      await adminApi.logout();
    } finally {
      setAdmin(null);
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await adminApi.changePassword(currentPassword, newPassword);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      admin,
      loading,
      login,
      logout,
      changePassword,
      refresh,
      hasPermission: (permission) =>
        admin ? permissionsFor(admin).includes(permission) : false,
    }),
    [admin, changePassword, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hooks and permission helpers intentionally live beside the provider so the
// auth contract stays single-sourced; Fast Refresh does not inspect these
// exports as components.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

// eslint-disable-next-line react-refresh/only-export-components
export function hasRolePermission(
  admin: AdminAccount,
  permission: Permission,
): boolean {
  return permissionsFor(admin).includes(permission);
}

export function AuthLoading() {
  return (
    <div className="full-page-state">
      <Spin size="large" />
      <span>正在校验管理会话…</span>
    </div>
  );
}
