import { describe, expect, test } from 'vitest';

import { classifyUserFacingErrorKey, UserFacingErrorI18nKey } from './userFacingError';

describe('user-facing error classification', () => {
  test.each([
    ['getaddrinfo ENOTFOUND api.example.com', UserFacingErrorI18nKey.Dns],
    ['connect ECONNREFUSED 127.0.0.1:18789', UserFacingErrorI18nKey.ConnectionRefused],
    ['certificate has expired', UserFacingErrorI18nKey.Certificate],
    ['no space left on device', UserFacingErrorI18nKey.DiskFull],
    ['ENOENT: file not found', UserFacingErrorI18nKey.FileMissing],
    ['OpenClaw runtime missing', UserFacingErrorI18nKey.RuntimeMissing],
    ['invalid JSON format', UserFacingErrorI18nKey.InvalidFormat],
  ])('maps %s', (message, expected) => {
    expect(classifyUserFacingErrorKey(message)).toBe(expected);
  });
});
