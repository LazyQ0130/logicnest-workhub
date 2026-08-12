import { Modal, Typography, App } from 'antd';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../utils/ui';
import { ChangePasswordForm, type ChangePasswordValues } from './ChangePasswordForm';

interface ChangePasswordModalProps {
  open: boolean;
  onClose(): void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const { changePassword } = useAuth();
  const { message } = App.useApp();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setError(undefined);
  }, [open]);

  const onSubmit = async ({ currentPassword, newPassword }: ChangePasswordValues) => {
    setSubmitting(true);
    setError(undefined);
    try {
      await changePassword(currentPassword, newPassword);
      message.success('管理员密码已修改，其他登录会话已退出');
      onClose();
    } catch (changeError) {
      setError(errorMessage(changeError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="修改管理员密码"
      open={open}
      onCancel={submitting ? undefined : onClose}
      footer={null}
      destroyOnHidden
      maskClosable={!submitting}
      width={480}
    >
      <Typography.Paragraph type="secondary">
        新密码至少 12 位。修改成功后，当前浏览器保持登录，其他登录会话将自动退出。
      </Typography.Paragraph>
      <ChangePasswordForm
        error={error}
        submitting={submitting}
        onSubmit={onSubmit}
        onCancel={onClose}
      />
    </Modal>
  );
}
