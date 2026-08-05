import fs from 'node:fs';
import path from 'node:path';

import { safeStorage } from 'electron';

export interface LicenseSessionRecord {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt?: string;
  user: {
    uid: string;
    phoneMasked: string;
    status: 'active' | 'suspended';
  };
  membership: {
    status: 'none' | 'active' | 'expired' | 'revoked';
    planCode?: string;
    expiresAt?: string;
    entitlementVersion?: number;
  };
  device: {
    status: 'active' | 'suspended' | 'unbound';
    lastOnlineAt?: string;
    clientVersion?: string;
  } | null;
  licenseCacheJws?: string;
  offlineUntil?: string;
  lastServerTime?: string;
  observedWallClockMs?: number;
}

export interface LicenseSessionStore {
  load(): Promise<LicenseSessionRecord | null>;
  save(record: LicenseSessionRecord): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Main-process-only session persistence. Renderer code never receives the
 * refresh token or the signed lease. Windows safeStorage is backed by DPAPI;
 * if it is unavailable we fail closed instead of writing plaintext secrets.
 */
export class ElectronSecureSessionStore implements LicenseSessionStore {
  private readonly filePath: string;

  public constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'license', 'session.bin');
  }

  public async load(): Promise<LicenseSessionRecord | null> {
    try {
      const encoded = await fs.promises.readFile(this.filePath, 'utf8');
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('OS secure storage is unavailable');
      }
      const decrypted = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
      const parsed: unknown = JSON.parse(decrypted);
      if (!isLicenseSessionRecord(parsed)) {
        throw new Error('Stored license session has an invalid shape');
      }
      return parsed;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return null;
      console.warn('[License] secure session could not be loaded:', error);
      return null;
    }
  }

  public async save(record: LicenseSessionRecord): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS secure storage is unavailable');
    }
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(record)).toString('base64');
    const temporaryPath = `${this.filePath}.tmp`;
    await fs.promises.writeFile(temporaryPath, encrypted, { encoding: 'utf8', flag: 'w' });
    await fs.promises.rename(temporaryPath, this.filePath);
  }

  public async clear(): Promise<void> {
    try {
      await fs.promises.unlink(this.filePath);
    } catch (error) {
      if (!(isNodeError(error) && error.code === 'ENOENT')) throw error;
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isLicenseSessionRecord(value: unknown): value is LicenseSessionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<LicenseSessionRecord>;
  return typeof record.accessToken === 'string'
    && typeof record.refreshToken === 'string'
    && Boolean(record.user && typeof record.user.uid === 'string')
    && Boolean(record.membership && typeof record.membership.status === 'string');
}
