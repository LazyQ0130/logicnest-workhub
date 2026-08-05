import { ApiError } from '../api/client';

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'ADMIN_PASSWORD_CHANGE_REQUIRED') {
      return '首次登录必须先修改密码';
    }
    if (error.code === 'PLAN_IN_USE') {
      return '该套餐已关联卡密或会员，请改为停用';
    }
    if (error.code === 'CSRF_INVALID' || error.code === 'CSRF_TOKEN_MISSING') {
      return '安全令牌已失效，请刷新页面后重试';
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
