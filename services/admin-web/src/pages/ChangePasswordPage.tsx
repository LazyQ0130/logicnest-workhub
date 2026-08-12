import { LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Typography, App } from 'antd';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BRAND } from '../brand';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../utils/ui';

interface PasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function ChangePasswordPage() {
  const { admin, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  if (!admin) return <Navigate to="/login" replace />;
  if (!admin.mustChangePassword) return <Navigate to="/dashboard" replace />;

  const onFinish = async ({ currentPassword, newPassword }: PasswordValues) => {
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
          为保护 {BRAND.chineseName} 管理数据，初始密码只能使用一次。新密码至少 8 位，建议同时包含字母与数字。
        </Typography.Paragraph>
        {error && <Alert className="form-alert" type="error" showIcon message={error} />}
        <Form<PasswordValues>
          layout="vertical"
          requiredMark={false}
          onFinish={onFinish}
          validateTrigger="onBlur"
        >
          <Form.Item
            name="currentPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '新密码至少 8 位' },
            ]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" block loading={submitting}>
            保存新密码
          </Button>
          <Button type="link" block onClick={signOut} disabled={submitting}>
            退出并稍后处理
          </Button>
        </Form>
      </section>
    </main>
  );
}
