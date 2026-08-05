import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';

import { APP_USER_MODEL_ID } from '../appConstants';

const MACHINE_GUID_REGISTRY = 'HKLM\\SOFTWARE\\Microsoft\\Cryptography';

export function normalizeMachineIdentifier(value: string): string {
  return value.trim().replace(/[{}]/g, '').replace(/\s+/g, '').toLowerCase();
}

export function readStableMachineIdentifier(): string {
  if (process.platform === 'win32') {
    try {
      const output = execFileSync('reg.exe', ['query', MACHINE_GUID_REGISTRY, '/v', 'MachineGuid'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2_000,
        windowsHide: true,
      });
      const line = output.split(/\r?\n/).find(item => /MachineGuid\s+REG_/i.test(item));
      const value = line?.match(/REG_[A-Z0-9_]+\s+(.+)$/i)?.[1];
      if (value) return normalizeMachineIdentifier(value);
    } catch {
      // Fall through to a non-hardware installation identifier. Raw hardware
      // identifiers are never logged or uploaded.
    }
  }
  return normalizeMachineIdentifier(`${os.platform()}-${os.arch()}-${os.hostname()}`);
}

export function computeDeviceFingerprintDigest(machineIdentifier: string): string {
  return createHash('sha256')
    .update(APP_USER_MODEL_ID, 'utf8')
    .update('\0', 'utf8')
    .update(normalizeMachineIdentifier(machineIdentifier), 'utf8')
    .digest('hex');
}

export function getDeviceFingerprintDigest(): string {
  return computeDeviceFingerprintDigest(readStableMachineIdentifier());
}
