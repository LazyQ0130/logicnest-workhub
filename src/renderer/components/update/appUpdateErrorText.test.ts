import { afterEach, describe, expect, test } from 'vitest';

import {
  APP_UPDATE_ELEVATION_DECLINED_ERROR,
  APP_UPDATE_FILE_INVALID_ERROR,
  APP_UPDATE_URL_UNTRUSTED_ERROR,
} from '../../../shared/appUpdate/constants';
import { i18nService } from '../../services/i18n';
import { formatAppUpdateError } from './appUpdateErrorText';

describe('formatAppUpdateError', () => {
  afterEach(() => {
    i18nService.setLanguage('zh', { persist: false });
  });

  test('localizes stable Windows update errors in Chinese', () => {
    i18nService.setLanguage('zh', { persist: false });

    expect(formatAppUpdateError(APP_UPDATE_ELEVATION_DECLINED_ERROR)).toContain(
      '系统授权',
    );
    expect(formatAppUpdateError(APP_UPDATE_URL_UNTRUSTED_ERROR)).toContain(
      'HTTPS 安全要求',
    );
    expect(formatAppUpdateError(APP_UPDATE_FILE_INVALID_ERROR)).toContain(
      '文件校验失败',
    );
  });

  test('localizes an unsafe update URL in English', () => {
    i18nService.setLanguage('en', { persist: false });

    expect(formatAppUpdateError(APP_UPDATE_URL_UNTRUSTED_ERROR)).toContain(
      'HTTPS safety requirements',
    );
  });

  test('hides unknown English operating-system messages in Chinese', () => {
    i18nService.setLanguage('zh', { persist: false });

    const message = formatAppUpdateError('Access is denied.');
    expect(message).toContain('检查失败');
    expect(message).not.toContain('Access is denied.');
  });

  test('preserves unknown operating-system messages in English', () => {
    i18nService.setLanguage('en', { persist: false });

    expect(formatAppUpdateError('Access is denied.')).toBe('Access is denied.');
  });
});
