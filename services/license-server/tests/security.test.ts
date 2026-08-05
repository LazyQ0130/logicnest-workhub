import { generateKeyPairSync } from 'node:crypto';
import { compactVerify, importSPKI } from 'jose';
import { describe, expect, test } from 'vitest';
import { parseConfig } from '../src/config.js';
import {
  generateLicenseKey,
  hmacDigest,
  issueAccessToken,
  issueOfflineJws,
  licenseDigest,
  normalizeLicenseKey,
  normalizePhone,
  safeEqual,
  validatePassword,
  verifyAccessToken,
} from '../src/security.js';
import { AppError } from '../src/errors.js';

const keys = generateKeyPairSync('ed25519');
const privateDer = keys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const publicDer = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const env = {
  NODE_ENV: 'test', DATABASE_URL: 'mysql://test:test@127.0.0.1:3306/test', ALLOWED_ORIGINS: 'http://localhost:5176',
  JWT_SECRET: 'j'.repeat(40), REFRESH_TOKEN_HMAC_SECRET: 'r'.repeat(40), ADMIN_SESSION_HMAC_SECRET: 'a'.repeat(40),
  CARD_HMAC_SECRET: 'c'.repeat(40), DEVICE_HMAC_SECRET: 'd'.repeat(40), IP_HMAC_SECRET: 'i'.repeat(40),
  LICENSE_JWS_PRIVATE_KEY_B64: privateDer, LICENSE_JWS_PUBLIC_KEY_B64: publicDer,
};
const config = parseConfig(env);

describe('input and secret primitives', () => {
  test('normalizes mainland phone numbers and rejects malformed values', () => {
    expect(normalizePhone('138 0013 8000')).toBe('+8613800138000');
    expect(normalizePhone('+86-138-0013-8000')).toBe('+8613800138000');
    expect(() => normalizePhone('123')).toThrowError(AppError);
  });

  test('generates unpredictable, normalizable license keys', () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^LQGX-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/);
    expect(normalizeLicenseKey(key)).toBe(key);
    expect(licenseDigest(config.cardHmacSecret, key)).toHaveLength(64);
    expect(licenseDigest(config.cardHmacSecret, key.toLowerCase().replaceAll('-', ''))).toBe(licenseDigest(config.cardHmacSecret, key));
  });

  test('uses timing-safe equality and validates password length', () => {
    expect(safeEqual('same', 'same')).toBe(true);
    expect(safeEqual('same', 'different')).toBe(false);
    expect(() => validatePassword('short')).toThrowError(AppError);
    expect(() => validatePassword('a'.repeat(129))).toThrowError(AppError);
  });
});

describe('signed tokens', () => {
  test('issues and verifies short-lived access JWTs', async () => {
    const token = await issueAccessToken(config, { sub: 'user-1', uid: 'LN-1', ver: 3 });
    await expect(verifyAccessToken(config, token)).resolves.toMatchObject({ sub: 'user-1', uid: 'LN-1', ver: 3, typ: 'access' });
    await expect(verifyAccessToken(config, `${token}tampered`)).rejects.toThrowError(AppError);
  });

  test('signs offline authorization as Ed25519 JWS', async () => {
    const compact = await issueOfflineJws(config, { sub: 'u1', did: 'd1', offlineUntil: new Date(Date.now() + 3600_000).toISOString() });
    const publicKey = await importSPKI(config.licenseJwsPublicKeyPem, 'EdDSA');
    const verified = await compactVerify(compact, publicKey);
    expect(JSON.parse(new TextDecoder().decode(verified.payload))).toMatchObject({ sub: 'u1', did: 'd1' });
    expect(verified.protectedHeader).toMatchObject({ alg: 'EdDSA', typ: 'logicnest-license+jwt', kid: config.licenseJwsKeyId });
  });
});

describe('environment policy', () => {
  test('caps offline grace and requires production origins', () => {
    expect(() => parseConfig({ ...env, OFFLINE_GRACE_HOURS: '73' })).toThrow(/Invalid configuration/);
    expect(() => parseConfig({ ...env, NODE_ENV: 'production', ALLOWED_ORIGINS: '' })).toThrow(/ALLOWED_ORIGINS/);
  });
});
