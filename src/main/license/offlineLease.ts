import { createPublicKey, verify } from 'node:crypto';

import { APP_USER_MODEL_ID } from '../../shared/brand';

export interface OfflineLeasePayload {
  v: number;
  iss: string;
  aud: string;
  sub: string;
  did: string;
  sid: string;
  userVersion: number;
  deviceVersion: number;
  entitlementVersion: number;
  planCode?: string;
  membershipExpiresAt: string;
  iat: string;
  serverTime: string;
  offlineUntil: string;
  heartbeatAfterSeconds: number;
  jti: string;
}

export interface OfflineLeaseValidation {
  valid: boolean;
  reason?: string;
  payload?: OfflineLeasePayload;
}

export function validateOfflineLease(
  compactJws: string,
  options: {
    publicKeyPem: string;
    expectedUid: string;
    expectedDeviceDigest: string;
    nowMs?: number;
    lastServerTimeMs?: number;
  },
): OfflineLeaseValidation {
  const nowMs = options.nowMs ?? Date.now();
  const parts = compactJws.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  let header: Record<string, unknown>;
  let payload: OfflineLeasePayload;
  let signature: Buffer;
  try {
    header = JSON.parse(decodeBase64Url(parts[0]).toString('utf8')) as Record<string, unknown>;
    payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf8')) as OfflineLeasePayload;
    signature = decodeBase64Url(parts[2]);
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (header.alg !== 'EdDSA' || header.typ !== 'logicnest-license+jwt') {
    return { valid: false, reason: 'algorithm' };
  }
  if (!isLeasePayload(payload) || payload.aud !== APP_USER_MODEL_ID || payload.sub !== options.expectedUid
    || payload.did !== options.expectedDeviceDigest) {
    return { valid: false, reason: 'binding' };
  }
  if (options.lastServerTimeMs !== undefined && Date.parse(payload.serverTime) + 5 * 60_000 < options.lastServerTimeMs) {
    return { valid: false, reason: 'server-time-rollback' };
  }
  const offlineUntilMs = Date.parse(payload.offlineUntil);
  const expiresAtMs = Date.parse(payload.membershipExpiresAt);
  const issuedAtMs = Date.parse(payload.iat);
  if (![offlineUntilMs, expiresAtMs, issuedAtMs].every(Number.isFinite)) {
    return { valid: false, reason: 'timestamps' };
  }
  if (offlineUntilMs <= nowMs || expiresAtMs <= nowMs || issuedAtMs > nowMs + 5 * 60_000) {
    return { valid: false, reason: 'expired' };
  }
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey(options.publicKeyPem);
  } catch {
    return { valid: false, reason: 'public-key' };
  }
  const signedBytes = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
  if (!verify(null, signedBytes, publicKey, signature)) {
    return { valid: false, reason: 'signature' };
  }
  return { valid: true, payload };
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(normalized, 'base64');
}

function isLeasePayload(value: unknown): value is OfflineLeasePayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<OfflineLeasePayload>;
  return payload.v === 1
    && typeof payload.iss === 'string'
    && typeof payload.aud === 'string'
    && typeof payload.sub === 'string'
    && typeof payload.did === 'string'
    && typeof payload.sid === 'string'
    && typeof payload.userVersion === 'number'
    && typeof payload.deviceVersion === 'number'
    && typeof payload.entitlementVersion === 'number'
    && typeof payload.membershipExpiresAt === 'string'
    && typeof payload.iat === 'string'
    && typeof payload.serverTime === 'string'
    && typeof payload.offlineUntil === 'string'
    && typeof payload.heartbeatAfterSeconds === 'number'
    && typeof payload.jti === 'string';
}
