import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { importPKCS8, SignJWT, jwtVerify } from 'jose';
import type { AppConfig } from './config.js';
import { AppError, badRequest, unauthorized } from './errors.js';

const PHONE_RE = /^\+86\d{11}$/;
const CARD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CARD_RAW_LENGTH = 20;

export const normalizePhone = (input: string, defaultCountry = '+86'): string => {
  const value = input.trim().replace(/[\s()-]/g, '');
  const normalized = value.startsWith('+') ? value : `${defaultCountry}${value}`;
  if (!PHONE_RE.test(normalized)) throw badRequest('INVALID_PHONE', 'Enter a valid mainland China mobile number');
  return normalized;
};

export const phoneLast4 = (normalized: string) => normalized.slice(-4);

export const validatePassword = (password: string): void => {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw badRequest('INVALID_PASSWORD', 'Password must be 8 to 128 characters');
  }
};

export const randomToken = (bytes = 48): string => randomBytes(bytes).toString('base64url');
export const newId = (): string => randomUUID();

export const hmacDigest = (secret: string, value: string): string => createHmac('sha256', secret).update(value).digest('hex');
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
export const safeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const normalizeLicenseKey = (input: string): string => {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== CARD_RAW_LENGTH || !raw.startsWith('LQGX')) {
    throw badRequest('INVALID_LICENSE_KEY', 'The license key format is invalid');
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}`;
};

export const licenseDigest = (secret: string, input: string): string => hmacDigest(secret, normalizeLicenseKey(input));

export const generateLicenseKey = (): string => {
  const bytes = randomBytes(16);
  let body = '';
  for (const byte of bytes) body += CARD_ALPHABET[byte & 31];
  const raw = `LQGX${body}`;
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}`;
};

export const csvEscape = (value: string | number | Date | null | undefined): string => {
  const text = value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const keysToCsv = (keys: Array<{ key: string; planCode: string; expiresAt?: Date | null }>): string => {
  const rows = ['key,plan_code,expires_at'];
  for (const item of keys) rows.push([item.key, item.planCode, item.expiresAt].map(csvEscape).join(','));
  return `${rows.join('\r\n')}\r\n`;
};

export type AccessClaims = {
  sub: string;
  uid: string;
  ver: number;
  did?: string;
  dver?: number;
  typ: 'access';
};

export const issueAccessToken = async (config: AppConfig, claims: Omit<AccessClaims, 'typ'>): Promise<string> => new SignJWT({
  uid: claims.uid,
  ver: claims.ver,
  ...(claims.did ? { did: claims.did } : {}),
  ...(claims.dver !== undefined ? { dver: claims.dver } : {}),
  typ: 'access',
})
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setSubject(claims.sub)
  .setIssuedAt()
  .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
  .sign(new TextEncoder().encode(config.jwtSecret));

export const verifyAccessToken = async (config: AppConfig, token: string): Promise<AccessClaims> => {
  try {
    const result = await jwtVerify(token, new TextEncoder().encode(config.jwtSecret), { algorithms: ['HS256'] });
    const payload = result.payload;
    if (payload.typ !== 'access' || typeof payload.sub !== 'string' || typeof payload.uid !== 'string' || typeof payload.ver !== 'number') {
      throw new Error('invalid claims');
    }
    if (payload.did !== undefined && typeof payload.did !== 'string') throw new Error('invalid device claim');
    if (payload.dver !== undefined && typeof payload.dver !== 'number') throw new Error('invalid device version');
    return {
      sub: payload.sub,
      uid: payload.uid,
      ver: payload.ver,
      ...(payload.did ? { did: payload.did } : {}),
      ...(typeof payload.dver === 'number' ? { dver: payload.dver } : {}),
      typ: 'access',
    };
  } catch {
    throw unauthorized('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired');
  }
};

const asPem = (data: Buffer, label: 'PRIVATE KEY' | 'PUBLIC KEY') => {
  const body = data.toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
};

export const issueOfflineJws = async (
  config: AppConfig,
  payload: Record<string, unknown>,
): Promise<string> => {
  const privateKey = await importPKCS8(asPem(config.licenseJwsPrivateKey.export({ format: 'der', type: 'pkcs8' }), 'PRIVATE KEY'), 'EdDSA');
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'logicnest-license+jwt', kid: config.licenseJwsKeyId })
    .setIssuer('logicnest-license-server')
    .sign(privateKey);
};

export const getPublicKeyPem = (config: AppConfig): string => config.licenseJwsPublicKeyPem;

export const assertHttps = (request: { headers: Record<string, string | string[] | undefined>; protocol?: string }, required: boolean) => {
  if (!required) return;
  const forwarded = request.headers['x-forwarded-proto'];
  const protocol = Array.isArray(forwarded) ? forwarded[0] : forwarded ?? request.protocol;
  if (protocol !== 'https') throw new AppError(400, 'HTTPS_REQUIRED', 'HTTPS is required');
};

export const redactPhone = (normalized: string): string => `+86******${normalized.slice(-4)}`;
export const redactDigest = (digest: string, visible = 8): string => `${digest.slice(0, visible)}…`;
