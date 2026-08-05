import { createPublicKey } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PACKAGED_LICENSE_CONFIG_PATH = path.join('config', 'license.json');
const PACKAGED_LICENSE_CONFIG_SCHEMA_VERSION = 1;
const DEVELOPMENT_LICENSE_API_URL = 'http://127.0.0.1:8787/api/v1';

export const LicenseRuntimeConfigError = {
  Missing: 'missing',
  InvalidJson: 'invalid_json',
  InvalidSchema: 'invalid_schema',
  InvalidApiUrl: 'invalid_api_url',
  InvalidPublicKey: 'invalid_public_key',
  ReadFailed: 'read_failed',
} as const;

export type LicenseRuntimeConfigError = typeof LicenseRuntimeConfigError[keyof typeof LicenseRuntimeConfigError];

export interface LicenseRuntimeConfig {
  apiBaseUrl?: string;
  publicKeyPem?: string;
}

export interface LicenseRuntimeConfigResult {
  config: LicenseRuntimeConfig;
  error?: LicenseRuntimeConfigError;
}

interface ResolveLicenseRuntimeConfigOptions {
  env: NodeJS.ProcessEnv;
  isDev: boolean;
  isPackaged: boolean;
  resourcesPath: string;
  readFileSync?: (filePath: string, encoding: BufferEncoding) => string;
}

interface PackagedLicenseConfig {
  schemaVersion: number;
  apiBaseUrl: string;
  publicKeyPem: string;
  allowInsecureLoopback?: boolean;
}

export function resolveLicenseRuntimeConfig(
  options: ResolveLicenseRuntimeConfigOptions,
): LicenseRuntimeConfigResult {
  if (!options.isPackaged) {
    return {
      config: {
        apiBaseUrl: normalizeOptionalString(options.env.LOGICNEST_LICENSE_API_URL)
          ?? (options.isDev ? DEVELOPMENT_LICENSE_API_URL : undefined),
        publicKeyPem: normalizeOptionalString(options.env.LOGICNEST_LICENSE_PUBLIC_KEY_PEM),
      },
    };
  }

  const configPath = path.join(options.resourcesPath, PACKAGED_LICENSE_CONFIG_PATH);
  let rawConfig: string;
  try {
    rawConfig = (options.readFileSync ?? fs.readFileSync)(configPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      config: {},
      error: code === 'ENOENT' ? LicenseRuntimeConfigError.Missing : LicenseRuntimeConfigError.ReadFailed,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    return { config: {}, error: LicenseRuntimeConfigError.InvalidJson };
  }

  if (!isPackagedLicenseConfig(parsed)) {
    return { config: {}, error: LicenseRuntimeConfigError.InvalidSchema };
  }

  const apiBaseUrl = validatePackagedApiUrl(parsed.apiBaseUrl, parsed.allowInsecureLoopback === true);
  if (!apiBaseUrl) {
    return { config: {}, error: LicenseRuntimeConfigError.InvalidApiUrl };
  }
  if (!isEd25519PublicKey(parsed.publicKeyPem)) {
    return { config: {}, error: LicenseRuntimeConfigError.InvalidPublicKey };
  }

  return {
    config: {
      apiBaseUrl,
      publicKeyPem: parsed.publicKeyPem.trim(),
    },
  };
}

function isPackagedLicenseConfig(value: unknown): value is PackagedLicenseConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PackagedLicenseConfig>;
  return candidate.schemaVersion === PACKAGED_LICENSE_CONFIG_SCHEMA_VERSION
    && typeof candidate.apiBaseUrl === 'string'
    && typeof candidate.publicKeyPem === 'string';
}

function validatePackagedApiUrl(value: string, allowInsecureLoopback: boolean): string | null {
  try {
    const url = new URL(value.trim());
    const isInsecureQaUrl = allowInsecureLoopback
      && url.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !isInsecureQaUrl)
      || url.username
      || url.password
      || url.search
      || url.hash) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isEd25519PublicKey(value: string): boolean {
  try {
    return createPublicKey(value.trim()).asymmetricKeyType === 'ed25519';
  } catch {
    return false;
  }
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
