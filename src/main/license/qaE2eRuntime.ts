import path from 'node:path';

export const LicenseQaEnvironment = {
  Development: 'development',
  Test: 'test',
} as const;

export interface LicenseQaE2eRuntimeConfig {
  enabled: boolean;
  userDataPath?: string;
  deviceFingerprint?: string;
}

interface ResolveLicenseQaE2eRuntimeOptions {
  env: NodeJS.ProcessEnv;
  isPackaged: boolean;
  defaultUserDataPath: string;
}

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;

export function resolveLicenseQaE2eRuntime(
  options: ResolveLicenseQaE2eRuntimeOptions,
): LicenseQaE2eRuntimeConfig {
  const allowedEnvironment = options.env.NODE_ENV === LicenseQaEnvironment.Development
    || options.env.NODE_ENV === LicenseQaEnvironment.Test;
  const enabled = !options.isPackaged
    && allowedEnvironment
    && options.env.LOGICNEST_QA_E2E === '1';

  if (!enabled) return { enabled: false };

  const requestedUserDataPath = options.env.LOGICNEST_QA_USER_DATA_DIR?.trim();
  if (!requestedUserDataPath || !path.isAbsolute(requestedUserDataPath)) {
    throw new Error('QA E2E requires an absolute LOGICNEST_QA_USER_DATA_DIR');
  }
  if (samePath(requestedUserDataPath, options.defaultUserDataPath)) {
    throw new Error('QA E2E userData directory must differ from the regular application directory');
  }

  const deviceFingerprint = options.env.LOGICNEST_QA_DEVICE_FINGERPRINT?.trim();
  if (deviceFingerprint && !FINGERPRINT_PATTERN.test(deviceFingerprint)) {
    throw new Error('QA E2E device fingerprint must be a 64-character hexadecimal digest');
  }

  return {
    enabled: true,
    userDataPath: path.resolve(requestedUserDataPath),
    deviceFingerprint: deviceFingerprint?.toLowerCase(),
  };
}

function samePath(first: string, second: string): boolean {
  const normalize = (value: string): string => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  return normalize(first) === normalize(second);
}
