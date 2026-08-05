import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BRAND } from '../brand';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../utils/ui';

interface LoginValues {
  username: string;
  password: string;
}

function LoginBrand() {
  const [logoAvailable, setLogoAvailable] = useState(true);
  return (
    <div className="login-brand">
      {logoAvailable ? (
        <img
          src={BRAND.logoSource}
          alt={BRAND.chineseName}
          onError={() => setLogoAvailable(false)}
        />
      ) : (
        <span className="login-brand-fallback" aria-hidden="true">
          逻
        </span>
      )}
      <div>
        <Typography.Title level={1}>{BRAND.chineseName}</Typography.Title>
        <span>{BRAND.englishName}</span>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { admin, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  if (!loading && admin) {
    return <Navigate to={admin.mustChangePassword ? '/change-password' : '/dashboard'} replace />;
  }

  const onFinish = async ({ username, password }: LoginValues) => {
    setSubmitting(true);
    setError(undefined);
    try {
      const account = await login(username.trim(), password);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from
        ?.pathname;
      navigate(
        account.mustChangePassword
          ? '/change-password'
          : from && from !== '/login'
            ? from
            : '/dashboard',
        { replace: true },
      );
    } catch (loginError) {
      if (loginError instanceof ApiError && loginError.status === 429) {
        setError('登录失败次数过多，请稍后再试。');
      } else {
        setError(errorMessage(loginError));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />
      <section className="login-card" aria-labelledby="login-title">
        <LoginBrand />
        <div className="login-copy">
          <Typography.Title id="login-title" level={2}>
            运营中心登录
          </Typography.Title>
          <Typography.Paragraph>
            使用已配置的管理账号进入逻栖工枢运营中心。
          </Typography.Paragraph>
        </div>
        {error && <Alert className="form-alert" type="error" showIcon message={error} />}
        <Form<LoginValues> layout="vertical" requiredMark={false} onFinish={onFinish}>
          <Form.Item
            name="username"
            label="管理员账号"
            rules={[{ required: true, message: '请输入管理员账号' }]}
          >
            <Input
              size="large"
              autoComplete="username"
              prefix={<UserOutlined />}
              placeholder="例如：ops-admin"
              autoFocus
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              size="large"
              autoComplete="current-password"
              prefix={<LockOutlined />}
              placeholder="请输入密码"
            />
          </Form.Item>
          <Button
            type="primary"
            size="large"
            htmlType="submit"
            block
            loading={submitting}
          >
            登录运营中心
          </Button>
        </Form>
        <div className="auth-security-note">
          <span className="security-dot" />
          关键操作将记录审计日志
        </div>
      </section>
    </main>
  );
}
