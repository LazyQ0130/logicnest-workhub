import { describe, expect, test } from 'vitest';

import { formatLicenseExpiry } from './licenseAccountPresentation';

describe('license account expiry presentation', () => {
  const now = Date.parse('2026-08-04T00:00:00.000Z');

  test('formats active time in days and hours', () => {
    const result = formatLicenseExpiry('2026-08-06T03:00:00.000Z', now, 'zh');
    expect(result.status).toBe('active');
    expect(result.remaining).toBe('2天 3小时');
    expect(result.expiresAt).toBeTruthy();
  });

  test('formats short active time in minutes', () => {
    expect(formatLicenseExpiry('2026-08-04T00:42:00.000Z', now, 'en')).toMatchObject({
      status: 'active',
      remaining: '42m',
    });
  });

  test('handles expired and missing timestamps explicitly', () => {
    expect(formatLicenseExpiry('2026-08-03T23:59:00.000Z', now, 'zh').status).toBe('expired');
    expect(formatLicenseExpiry(undefined, now, 'zh')).toEqual({
      status: 'unknown',
      remaining: null,
      expiresAt: null,
    });
  });
});
