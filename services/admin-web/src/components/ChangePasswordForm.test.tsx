import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ChangePasswordForm } from './ChangePasswordForm';

afterEach(cleanup);

describe('ChangePasswordForm', () => {
  test('rejects a short password and password reuse', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChangePasswordForm submitting={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('当前密码'), 'same-password');
    await user.type(screen.getByLabelText('新密码'), 'same-password');
    await user.type(screen.getByLabelText('确认新密码'), 'same-password');
    await user.click(screen.getByRole('button', { name: '保存新密码' }));

    expect(await screen.findByText('新密码不能与当前密码相同')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('rejects mismatched confirmation', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChangePasswordForm submitting={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('当前密码'), 'current-password');
    await user.type(screen.getByLabelText('新密码'), 'new-password-123');
    await user.type(screen.getByLabelText('确认新密码'), 'different-12345');
    await user.click(screen.getByRole('button', { name: '保存新密码' }));

    expect(await screen.findByText('两次输入的新密码不一致')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('submits a valid password change', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChangePasswordForm submitting={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('当前密码'), 'current-password');
    await user.type(screen.getByLabelText('新密码'), 'new-password-123');
    await user.type(screen.getByLabelText('确认新密码'), 'new-password-123');
    await user.click(screen.getByRole('button', { name: '保存新密码' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPassword: 'current-password',
        newPassword: 'new-password-123',
      }),
    );
  });
});
