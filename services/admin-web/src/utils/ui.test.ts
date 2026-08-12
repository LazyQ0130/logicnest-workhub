import { describe, expect, test } from 'vitest';
import { ApiError } from '../api/client';
import { errorMessage } from './ui';

describe('admin error messages', () => {
  test.each([
    ['CURRENT_PASSWORD_INVALID', '当前密码不正确'],
    ['WEAK_ADMIN_PASSWORD', '至少需要 12 位'],
    ['PASSWORD_REUSE', '不能与当前密码相同'],
  ])('localizes %s', (code, expected) => {
    expect(errorMessage(new ApiError(409, { code, message: 'English backend message' }))).toContain(expected);
  });
});
