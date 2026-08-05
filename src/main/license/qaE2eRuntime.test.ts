import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { resolveLicenseQaE2eRuntime } from './qaE2eRuntime';

const regularUserData = path.resolve('C:/qa-fixtures/regular-user-data');
const isolatedUserData = path.resolve('C:/qa-fixtures/e2e-user-data');
const fingerprint = 'ab'.repeat(32);

describe('resolveLicenseQaE2eRuntime', () => {
  test.each([
    { isPackaged: true, nodeEnv: 'development' },
    { isPackaged: false, nodeEnv: 'production' },
    { isPackaged: false, nodeEnv: 'development', qaSwitch: '0' },
  ])('ignores QA overrides outside an explicitly enabled unpackaged dev/test runtime', ({ isPackaged, nodeEnv, qaSwitch }) => {
    expect(resolveLicenseQaE2eRuntime({
      isPackaged,
      defaultUserDataPath: regularUserData,
      env: {
        NODE_ENV: nodeEnv,
        LOGICNEST_QA_E2E: qaSwitch ?? '1',
        LOGICNEST_QA_USER_DATA_DIR: isolatedUserData,
        LOGICNEST_QA_DEVICE_FINGERPRINT: fingerprint,
      },
    })).toEqual({ enabled: false });
  });

  test('accepts an isolated userData path and fingerprint only with the explicit QA switch', () => {
    expect(resolveLicenseQaE2eRuntime({
      isPackaged: false,
      defaultUserDataPath: regularUserData,
      env: {
        NODE_ENV: 'test',
        LOGICNEST_QA_E2E: '1',
        LOGICNEST_QA_USER_DATA_DIR: isolatedUserData,
        LOGICNEST_QA_DEVICE_FINGERPRINT: fingerprint.toUpperCase(),
      },
    })).toEqual({
      enabled: true,
      userDataPath: isolatedUserData,
      deviceFingerprint: fingerprint,
    });
  });

  test('rejects the regular userData path and malformed fingerprints when QA is enabled', () => {
    expect(() => resolveLicenseQaE2eRuntime({
      isPackaged: false,
      defaultUserDataPath: regularUserData,
      env: {
        NODE_ENV: 'development',
        LOGICNEST_QA_E2E: '1',
        LOGICNEST_QA_USER_DATA_DIR: regularUserData,
      },
    })).toThrow(/must differ/);

    expect(() => resolveLicenseQaE2eRuntime({
      isPackaged: false,
      defaultUserDataPath: regularUserData,
      env: {
        NODE_ENV: 'development',
        LOGICNEST_QA_E2E: '1',
        LOGICNEST_QA_USER_DATA_DIR: isolatedUserData,
        LOGICNEST_QA_DEVICE_FINGERPRINT: 'not-a-digest',
      },
    })).toThrow(/64-character hexadecimal/);
  });
});
