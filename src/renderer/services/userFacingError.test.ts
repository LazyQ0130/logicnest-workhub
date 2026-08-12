import { afterEach, describe, expect, test } from 'vitest';

import { i18nService } from './i18n';
import { formatUserFacingError } from './userFacingError';

describe('formatUserFacingError', () => {
  afterEach(() => i18nService.setLanguage('zh', { persist: false }));

  test('never exposes an unknown English upstream message in Chinese mode', () => {
    i18nService.setLanguage('zh', { persist: false });
    const result = formatUserFacingError('Totally new upstream failure marker');
    expect(result).toContain('操作失败');
    expect(result).not.toContain('upstream');
  });

  test('explains common failures in Chinese', () => {
    i18nService.setLanguage('zh', { persist: false });
    expect(formatUserFacingError('connect ECONNREFUSED 127.0.0.1')).toContain('拒绝');
    expect(formatUserFacingError('certificate has expired')).toContain('证书');
    expect(formatUserFacingError('no space left on device')).toContain('磁盘');
  });

  test('keeps diagnostic detail in English mode', () => {
    i18nService.setLanguage('en', { persist: false });
    expect(formatUserFacingError('Totally new upstream failure marker')).toBe(
      'Totally new upstream failure marker',
    );
  });

  test('explains authorization business errors without exposing English server text', () => {
    i18nService.setLanguage('zh', { persist: false });
    expect(formatUserFacingError({
      code: 'PHONE_ALREADY_REGISTERED',
      message: 'An account for this phone already exists',
    })).toContain('手机号已经注册');
    expect(formatUserFacingError({
      code: 'PASSWORD_MISMATCH',
      message: 'Passwords do not match',
    })).toContain('两次输入的密码不一致');
  });

  test('keeps authorization business errors localized in English mode', () => {
    i18nService.setLanguage('en', { persist: false });
    expect(formatUserFacingError({ code: 'INVALID_CREDENTIALS' })).toContain('phone number or password');
  });
});
