import { App as AntApp, ConfigProvider } from 'antd';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BRAND } from './brand';
import { AuthProvider } from './auth/AuthContext';
import { AuthenticatedRoute, PasswordChangeRoute, PermissionRoute } from './auth/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { Permission } from './api/types';

const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage').then((module) => ({ default: module.AuditLogsPage })));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage').then((module) => ({ default: module.ChangePasswordPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const DevicesPage = lazy(() => import('./pages/DevicesPage').then((module) => ({ default: module.DevicesPage })));
const PlansPage = lazy(() => import('./pages/PlansPage').then((module) => ({ default: module.PlansPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((module) => ({ default: module.UsersPage })));

const routeFallback = <div className="route-loading" role="status" aria-label="页面加载中" />;

export function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: BRAND.colors.ink900,
          colorInfo: BRAND.colors.neutral500,
          colorSuccess: '#2ebd85',
          colorWarning: BRAND.colors.warning,
          colorBgLayout: BRAND.colors.surface,
          borderRadius: 8,
          fontFamily: 'Inter, "Microsoft YaHei", "PingFang SC", sans-serif',
        },
        components: {
          Layout: { headerBg: '#ffffff', siderBg: BRAND.colors.ink900 },
          Menu: { darkItemBg: BRAND.colors.ink900, darkItemSelectedBg: BRAND.colors.ink700, darkItemHoverBg: BRAND.colors.ink800 },
          Table: { headerBg: '#f5f5f4' },
        },
      }}
    >
      <AntApp notification={{ placement: 'topRight' }} message={{ maxCount: 3 }}>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={routeFallback}>
              <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<AuthenticatedRoute />}>
                <Route element={<PasswordChangeRoute />}>
                  <Route path="/change-password" element={<ChangePasswordPage />} />
                </Route>
                <Route element={<AppShell />}>
                  <Route element={<PermissionRoute permission={Permission.DashboardRead} />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                  </Route>
                  <Route element={<PermissionRoute permission={Permission.UsersRead} />}>
                    <Route path="/users" element={<UsersPage />} />
                  </Route>
                  <Route element={<PermissionRoute permission={Permission.PlansRead} />}>
                    <Route path="/plans" element={<PlansPage />} />
                  </Route>
                  <Route element={<PermissionRoute permission={Permission.DevicesRead} />}>
                    <Route path="/devices" element={<DevicesPage />} />
                  </Route>
                  <Route element={<PermissionRoute permission={Permission.AuditLogsRead} />}>
                    <Route path="/audit-logs" element={<AuditLogsPage />} />
                  </Route>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>
              </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </AntApp>
    </ConfigProvider>
  );
}
