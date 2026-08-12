import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { LicenseRuntimeConfigError, resolveLicenseRuntimeConfig } from './runtimeConfig';

const PUBLIC_KEY_PEM = generateKeyPairSync('ed25519').publicKey.export({
  format: 'pem',
  type: 'spki',
}).toString();
const TRUSTED_CA_PEM = readFileSync(new URL('../../../resources/license/LogicNest-IP-CA.crt', import.meta.url), 'utf8');

describe('resolveLicenseRuntimeConfig', () => {
  test('loads the immutable HTTPS configuration from packaged resources', () => {
    const result = resolveLicenseRuntimeConfig({
      env: {
        LOGICNEST_LICENSE_API_URL: 'https://attacker.example/api/v1',
        LOGICNEST_LICENSE_PUBLIC_KEY_PEM: 'untrusted',
      },
      isDev: false,
      isPackaged: true,
      resourcesPath: 'C:\\app\\resources',
      readFileSync: () => JSON.stringify({
        schemaVersion: 1,
        apiBaseUrl: 'https://license.example/api/v1/',
        publicKeyPem: PUBLIC_KEY_PEM,
        allowInsecureLoopback: false,
        trustedCaPem: TRUSTED_CA_PEM,
      }),
    });

    expect(result).toEqual({
      config: {
        apiBaseUrl: 'https://license.example/api/v1',
        publicKeyPem: PUBLIC_KEY_PEM.trim(),
        trustedCaPem: TRUSTED_CA_PEM.trim(),
      },
    });
  });

  test('rejects an insecure packaged API URL', () => {
    const result = resolveLicenseRuntimeConfig({
      env: {},
      isDev: false,
      isPackaged: true,
      resourcesPath: 'C:\\app\\resources',
      readFileSync: () => JSON.stringify({
        schemaVersion: 1,
        apiBaseUrl: 'http://license.example/api/v1',
        publicKeyPem: PUBLIC_KEY_PEM,
      }),
    });

    expect(result.error).toBe(LicenseRuntimeConfigError.InvalidApiUrl);
    expect(result.config).toEqual({});
  });

  test('reports a missing packaged configuration without falling back to the environment', () => {
    const missingFileError = Object.assign(new Error('missing'), { code: 'ENOENT' });
    const result = resolveLicenseRuntimeConfig({
      env: { LOGICNEST_LICENSE_API_URL: 'https://environment.example/api/v1' },
      isDev: false,
      isPackaged: true,
      resourcesPath: 'C:\\app\\resources',
      readFileSync: () => { throw missingFileError; },
    });

    expect(result.error).toBe(LicenseRuntimeConfigError.Missing);
    expect(result.config).toEqual({});
  });

  test('permits packaged loopback HTTP only for an explicitly marked QA build', () => {
    const result = resolveLicenseRuntimeConfig({
      env: {},
      isDev: false,
      isPackaged: true,
      resourcesPath: 'C:\\app\\resources',
      readFileSync: () => JSON.stringify({
        schemaVersion: 1,
        apiBaseUrl: 'http://127.0.0.1:18787/api/v1',
        publicKeyPem: PUBLIC_KEY_PEM,
        allowInsecureLoopback: true,
      }),
    });

    expect(result.error).toBeUndefined();
    expect(result.config.apiBaseUrl).toBe('http://127.0.0.1:18787/api/v1');
  });

  test('keeps environment configuration available for unpackaged QA', () => {
    const result = resolveLicenseRuntimeConfig({
      env: {
        LOGICNEST_LICENSE_API_URL: 'http://127.0.0.1:18787/api/v1',
        LOGICNEST_LICENSE_PUBLIC_KEY_PEM: PUBLIC_KEY_PEM,
      },
      isDev: false,
      isPackaged: false,
      resourcesPath: '',
    });

    expect(result.config.apiBaseUrl).toBe('http://127.0.0.1:18787/api/v1');
    expect(result.config.publicKeyPem).toBe(PUBLIC_KEY_PEM.trim());
  });

  test('rejects invalid packaged CA material', () => {
    const result = resolveLicenseRuntimeConfig({
      env: {},
      isDev: false,
      isPackaged: true,
      resourcesPath: 'C:\\app\\resources',
      readFileSync: () => JSON.stringify({
        schemaVersion: 1,
        apiBaseUrl: 'https://license.example/api/v1',
        publicKeyPem: PUBLIC_KEY_PEM,
        trustedCaPem: 'not-a-certificate',
      }),
    });

    expect(result.error).toBe(LicenseRuntimeConfigError.InvalidTrustedCa);
    expect(result.config).toEqual({});
  });
});
