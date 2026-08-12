import { LockOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Space } from 'antd';

export interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ChangePasswordFormProps {
  error?: string;
  submitting: boolean;
  submitLabel?: string;
  onCancel?: () => void;
  onSubmit(values: ChangePasswordValues): Promise<void> | void;
}

export function ChangePasswordForm({
  error,
  submitting,
  submitLabel = '保存新密码',
  onCancel,
  onSubmit,
}: ChangePasswordFormProps) {
  const [form] = Form.useForm<ChangePasswordValues>();

  return (
    <>
      {error && <Alert className="form-alert" type="error" showIcon message={error} />}
      <Form<ChangePasswordValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={onSubmit}
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
          dependencies={['currentPassword']}
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 12, message: '新密码至少 12 位' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('currentPassword') !== value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('新密码不能与当前密码相同'));
              },
            }),
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
                return Promise.reject(new Error('两次输入的新密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Space className="password-form-actions" orientation="vertical" size={8}>
          <Button type="primary" size="large" htmlType="submit" block loading={submitting}>
            {submitLabel}
          </Button>
          {onCancel && (
            <Button type="link" block onClick={onCancel} disabled={submitting}>
              取消
            </Button>
          )}
        </Space>
      </Form>
    </>
  );
}
