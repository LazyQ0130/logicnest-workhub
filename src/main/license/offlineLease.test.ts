import { generateKeyPairSync, sign } from 'node:crypto';

import { describe, expect, test } from 'vitest';

import { APP_USER_MODEL_ID } from '../../shared/brand';
import { validateOfflineLease } from './offlineLease';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

describe('validateOfflineLease', () => {
  test('accepts a signed lease bound to this product, user, and device', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    const header = encode({ alg: 'EdDSA', typ: 'logicnest-license+jwt', kid: 'test' });
    const payload = encode({
      v: 1,
      iss: 'logicnest-license-server',
      aud: APP_USER_MODEL_ID,
      sub: 'LN-USER-1',
      did: 'device-digest',
      sid: 'entitlement-1',
      userVersion: 1,
      deviceVersion: 1,
      entitlementVersion: 1,
      planCode: 'MONTH',
      membershipExpiresAt: '2026-09-01T12:00:00.000Z',
      iat: '2026-08-02T12:00:00.000Z',
      serverTime: '2026-08-02T12:00:00.000Z',
      offlineUntil: '2026-08-05T12:00:00.000Z',
      heartbeatAfterSeconds: 300,
      jti: 'lease-1',
    });
    const signed = `${header}.${payload}`;
    const compactJws = `${signed}.${sign(null, Buffer.from(signed), privateKey).toString('base64url')}`;

    const result = validateOfflineLease(compactJws, {
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      expectedUid: 'LN-USER-1',
      expectedDeviceDigest: 'device-digest',
      nowMs: now,
    });

    expect(result.valid).toBe(true);
    expect(result.payload?.planCode).toBe('MONTH');
  });

  test('rejects tampering and device mismatch', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const header = encode({ alg: 'EdDSA', typ: 'logicnest-license+jwt' });
    const payload = encode({
      v: 1, iss: 'issuer', aud: APP_USER_MODEL_ID, sub: 'uid', did: 'device-a', sid: 'sid',
      userVersion: 1, deviceVersion: 1, entitlementVersion: 1,
      membershipExpiresAt: '2026-09-01T00:00:00.000Z', iat: '2026-08-02T00:00:00.000Z',
      serverTime: '2026-08-02T00:00:00.000Z', offlineUntil: '2026-08-05T00:00:00.000Z',
      heartbeatAfterSeconds: 300, jti: 'jti',
    });
    const signed = `${header}.${payload}`;
    const compactJws = `${signed}.${sign(null, Buffer.from(signed), privateKey).toString('base64url')}`;
    const common = {
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      expectedUid: 'uid', expectedDeviceDigest: 'device-b', nowMs: Date.parse('2026-08-03T00:00:00.000Z'),
    };

    expect(validateOfflineLease(compactJws, common)).toMatchObject({ valid: false, reason: 'binding' });
    expect(validateOfflineLease(`${signed}.AAAA`, { ...common, expectedDeviceDigest: 'device-a' }))
      .toMatchObject({ valid: false, reason: 'signature' });
  });
});
