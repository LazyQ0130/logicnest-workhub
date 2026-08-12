import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, test } from 'vitest';

interface LicenseBuildConfig {
  schemaVersion: number;
  apiBaseUrl: string;
  publicKeyPem: string;
  allowInsecureLoopback: boolean;
  trustedCaPem?: string;
}

interface LicenseBuildConfigModule {
  createLicenseBuildConfig: (
    env: Record<string, string | undefined>,
    options?: { repositoryRoot?: string },
  ) => LicenseBuildConfig;
}

const require = createRequire(import.meta.url);
const { createLicenseBuildConfig } = require('../scripts/license-build-config.cjs') as LicenseBuildConfigModule;
const PUBLIC_KEY_PEM = generateKeyPairSync('ed25519').publicKey.export({
  format: 'pem',
  type: 'spki',
}).toString();
const TRUSTED_CA_PEM = readFileSync(new URL('../resources/license/LogicNest-IP-CA.crt', import.meta.url), 'utf8');

describe('license build configuration', () => {
  test('creates a normalized production configuration', () => {
    const config = createLicenseBuildConfig({
      LOGICNEST_LICENSE_API_URL: 'https://license.example/api/v1/',
      LOGICNEST_LICENSE_PUBLIC_KEY_PEM: PUBLIC_KEY_PEM,
      LOGICNEST_LICENSE_CA_PEM: TRUSTED_CA_PEM,
    });

    expect(config.schemaVersion).toBe(1);
    expect(config.apiBaseUrl).toBe('https://license.example/api/v1');
    expect(config.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(config.allowInsecureLoopback).toBe(false);
    expect(config.trustedCaPem).toContain('BEGIN CERTIFICATE');
  });

  test('rejects missing configuration', () => {
    expect(() => createLicenseBuildConfig({})).toThrow('LOGICNEST_LICENSE_API_URL is required');
  });

  test('rejects insecure remote HTTP endpoints', () => {
    expect(() => createLicenseBuildConfig({
      LOGICNEST_LICENSE_API_URL: 'http://license.example/api/v1',
      LOGICNEST_LICENSE_PUBLIC_KEY_PEM: PUBLIC_KEY_PEM,
      LOGICNEST_LICENSE_ALLOW_INSECURE_HTTP: '1',
    })).toThrow('requires HTTPS');
  });

  test('permits loopback HTTP only with the explicit QA switch', () => {
    const config = createLicenseBuildConfig({
      LOGICNEST_LICENSE_API_URL: 'http://127.0.0.1:18787/api/v1',
      LOGICNEST_LICENSE_PUBLIC_KEY_PEM: PUBLIC_KEY_PEM,
      LOGICNEST_LICENSE_ALLOW_INSECURE_HTTP: '1',
    });

    expect(config.apiBaseUrl).toBe('http://127.0.0.1:18787/api/v1');
    expect(config.allowInsecureLoopback).toBe(true);
  });

  test('rejects private key material in the packaged trust input', () => {
    expect(() => createLicenseBuildConfig({
      LOGICNEST_LICENSE_API_URL: 'https://license.example/api/v1',
      LOGICNEST_LICENSE_PUBLIC_KEY_PEM: PUBLIC_KEY_PEM,
      LOGICNEST_LICENSE_CA_PEM: '-----BEGIN PRIVATE KEY-----\nnot-allowed\n-----END PRIVATE KEY-----',
    })).toThrow('must not contain a private key');
  });
});
