import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Result } from 'antd';
import { AuthLoading, useAuth } from './AuthContext';
import type { Permission } from '../api/types';

export function AuthenticatedRoute() {
  const { admin, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoading />;
  if (!admin) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (admin.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}

export function PermissionRoute({ permission }: { permission: Permission }) {
  const { admin, hasPermission } = useAuth();
  if (!admin || !hasPermission(permission)) {
    return (
      <Result
        status="403"
        title="没有访问权限"
        subTitle="请联系超级管理员申请相应的后台权限。"
      />
    );
  }
  return <Outlet />;
}

export function PasswordChangeRoute() {
  const { admin } = useAuth();
  if (!admin) return <Navigate to="/login" replace />;
  return <Outlet />;
}
