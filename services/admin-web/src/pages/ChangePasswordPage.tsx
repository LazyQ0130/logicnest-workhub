import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Typography, App } from 'antd';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BRAND } from '../brand';
import { useAuth } from '../auth/AuthContext';
import { ChangePasswordForm, type ChangePasswordValues } from '../components/ChangePasswordForm';
import { errorMessage } from '../utils/ui';

export function ChangePasswordPage() {
  const { admin, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  if (!admin) return <Navigate to="/login" replace />;
  if (!admin.mustChangePassword) return <Navigate to="/dashboard" replace />;

  const onFinish = async ({ currentPassword, newPassword }: ChangePasswordValues) => {
    setSubmitting(true);
    setError(undefined);
    try {
      await changePassword(currentPassword, newPassword);
      message.success('密码已更新，请继续使用控制台');
      navigate('/dashboard', { replace: true });
    } catch (changeError) {
      setError(errorMessage(changeError));
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="auth-page">
      <section className="login-card password-card" aria-labelledby="password-title">
        <div className="force-change-icon">
          <SafetyCertificateOutlined />
        </div>
        <Typography.Title id="password-title" level={2}>
          首次登录，请修改密码
        </Typography.Title>
        <Typography.Paragraph>
          为保护 {BRAND.chineseName} 管理数据，初始密码只能使用一次。新密码至少 12 位，建议同时包含字母与数字。
        </Typography.Paragraph>
        <ChangePasswordForm
          error={error}
          submitting={submitting}
          onSubmit={onFinish}
          onCancel={signOut}
          submitLabel="保存新密码"
        />
      </section>
    </main>
  );
}
