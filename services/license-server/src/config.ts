import { createPrivateKey, createPublicKey } from 'node:crypto';
import { z } from 'zod';

const boolFromEnv = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}, z.boolean());

const intFromEnv = (fallback: number, min: number, max: number) => z.preprocess(
  (value) => value === undefined || value === '' ? fallback : Number(value),
  z.number().int().min(min).max(max),
);

const nonEmptySecret = (name: string) => z.string().min(32, `${name} must contain at least 32 characters`);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOGICNEST_QA_E2E: boolFromEnv.default(false),
  HOST: z.string().default('127.0.0.1'),
  PORT: intFromEnv(8787, 1, 65535),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: boolFromEnv.default(false),
  REQUIRE_HTTPS: boolFromEnv.default(false),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ALLOWED_ORIGINS: z.string().default(''),
  JWT_SECRET: nonEmptySecret('JWT_SECRET'),
  REFRESH_TOKEN_HMAC_SECRET: nonEmptySecret('REFRESH_TOKEN_HMAC_SECRET'),
  ADMIN_SESSION_HMAC_SECRET: nonEmptySecret('ADMIN_SESSION_HMAC_SECRET'),
  CARD_HMAC_SECRET: nonEmptySecret('CARD_HMAC_SECRET'),
  DEVICE_HMAC_SECRET: nonEmptySecret('DEVICE_HMAC_SECRET'),
  IP_HMAC_SECRET: nonEmptySecret('IP_HMAC_SECRET'),
  LICENSE_JWS_PRIVATE_KEY_B64: z.string().min(1, 'LICENSE_JWS_PRIVATE_KEY_B64 is required'),
  LICENSE_JWS_PUBLIC_KEY_B64: z.string().min(1, 'LICENSE_JWS_PUBLIC_KEY_B64 is required'),
  LICENSE_JWS_KEY_ID: z.string().regex(/^[A-Za-z0-9._-]{3,64}$/).default('logicnest-license-1'),
  ACCESS_TOKEN_TTL_SECONDS: intFromEnv(900, 60, 3600),
  REFRESH_TOKEN_TTL_DAYS: intFromEnv(30, 1, 180),
  ADMIN_SESSION_TTL_HOURS: intFromEnv(12, 1, 168),
  OFFLINE_GRACE_HOURS: intFromEnv(72, 1, 72),
  HEARTBEAT_INTERVAL_SECONDS: intFromEnv(300, 30, 3600),
  ONLINE_WINDOW_SECONDS: intFromEnv(600, 60, 7200),
  ADMIN_BOOTSTRAP_USERNAME: z.string().trim().min(3).max(64).optional().or(z.literal('')),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional().or(z.literal('')),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  qaE2e: boolean;
  host: string;
  port: number;
  logLevel: string;
  trustProxy: boolean;
  requireHttps: boolean;
  databaseUrl: string;
  allowedOrigins: string[];
  jwtSecret: string;
  refreshTokenHmacSecret: string;
  adminSessionHmacSecret: string;
  cardHmacSecret: string;
  deviceHmacSecret: string;
  ipHmacSecret: string;
  licenseJwsPrivateKey: ReturnType<typeof createPrivateKey>;
  licenseJwsPublicKey: ReturnType<typeof createPublicKey>;
  licenseJwsPrivateKeyPem: string;
  licenseJwsPublicKeyPem: string;
  licenseJwsKeyId: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  adminSessionTtlHours: number;
  offlineGraceHours: number;
  heartbeatIntervalSeconds: number;
  onlineWindowSeconds: number;
  adminBootstrapUsername?: string;
  adminBootstrapPassword?: string;
};

const derToPem = (derB64: string, label: 'PRIVATE KEY' | 'PUBLIC KEY') => {
  const clean = derB64.trim();
  const body = clean.match(/.{1,64}/g)?.join('\n') ?? clean;
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
};

export const parseConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = environmentSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`).join('; ');
    throw new Error(`Invalid configuration: ${message}`);
  }
  const value = parsed.data;
  let privateKey: ReturnType<typeof createPrivateKey>;
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    const privateDer = Buffer.from(value.LICENSE_JWS_PRIVATE_KEY_B64, 'base64');
    const publicDer = Buffer.from(value.LICENSE_JWS_PUBLIC_KEY_B64, 'base64');
    if (privateDer.length < 32 || publicDer.length < 32) throw new Error('Ed25519 DER key is too short');
    privateKey = createPrivateKey({ key: privateDer, format: 'der', type: 'pkcs8' });
    publicKey = createPublicKey({ key: publicDer, format: 'der', type: 'spki' });
    if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('license signing keys must be Ed25519');
    }
  } catch (error) {
    throw new Error(`Invalid Ed25519 license signing key: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  const allowedOrigins = value.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (value.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    throw new Error('ALLOWED_ORIGINS must contain at least one origin in production');
  }
  const bootstrapUsername = value.ADMIN_BOOTSTRAP_USERNAME || undefined;
  const bootstrapPassword = value.ADMIN_BOOTSTRAP_PASSWORD || undefined;
  if ((bootstrapUsername && !bootstrapPassword) || (!bootstrapUsername && bootstrapPassword)) {
    throw new Error('ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD must be provided together');
  }
  return {
    nodeEnv: value.NODE_ENV,
    qaE2e: value.NODE_ENV !== 'production' && value.LOGICNEST_QA_E2E,
    host: value.HOST,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    trustProxy: value.TRUST_PROXY,
    requireHttps: value.REQUIRE_HTTPS || value.NODE_ENV === 'production',
    databaseUrl: value.DATABASE_URL,
    allowedOrigins,
    jwtSecret: value.JWT_SECRET,
    refreshTokenHmacSecret: value.REFRESH_TOKEN_HMAC_SECRET,
    adminSessionHmacSecret: value.ADMIN_SESSION_HMAC_SECRET,
    cardHmacSecret: value.CARD_HMAC_SECRET,
    deviceHmacSecret: value.DEVICE_HMAC_SECRET,
    ipHmacSecret: value.IP_HMAC_SECRET,
    licenseJwsPrivateKey: privateKey,
    licenseJwsPublicKey: publicKey,
    licenseJwsPrivateKeyPem: derToPem(value.LICENSE_JWS_PRIVATE_KEY_B64, 'PRIVATE KEY'),
    licenseJwsPublicKeyPem: derToPem(value.LICENSE_JWS_PUBLIC_KEY_B64, 'PUBLIC KEY'),
    licenseJwsKeyId: value.LICENSE_JWS_KEY_ID,
    accessTokenTtlSeconds: value.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: value.REFRESH_TOKEN_TTL_DAYS,
    adminSessionTtlHours: value.ADMIN_SESSION_TTL_HOURS,
    offlineGraceHours: value.OFFLINE_GRACE_HOURS,
    heartbeatIntervalSeconds: value.HEARTBEAT_INTERVAL_SECONDS,
    onlineWindowSeconds: value.ONLINE_WINDOW_SECONDS,
    ...(bootstrapUsername ? { adminBootstrapUsername: bootstrapUsername } : {}),
    ...(bootstrapPassword ? { adminBootstrapPassword: bootstrapPassword } : {}),
  };
};

export const getConfig = (() => {
  let cached: AppConfig | undefined;
  return (env?: NodeJS.ProcessEnv) => {
    if (env) return parseConfig(env);
    cached ??= parseConfig();
    return cached;
  };
})();

export { environmentSchema };
