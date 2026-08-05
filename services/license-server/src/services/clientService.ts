import type { Device, Entitlement, PrismaClient, User } from '@prisma/client';
import argon2 from 'argon2';
import type { FastifyRequest } from 'fastify';

import { writeAudit } from '../audit.js';
import type { AppConfig } from '../config.js';
import { conflict, forbidden, notFound, unauthorized } from '../errors.js';
import {
  type AccessClaims,
  generateLicenseKey,
  hmacDigest,
  issueAccessToken,
  issueOfflineJws,
  licenseDigest,
  newId,
  normalizeLicenseKey,
  normalizePhone,
  phoneLast4,
  randomToken,
  validatePassword,
} from '../security.js';

const ARGON2_OPTIONS = {
  type: 2 as const,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

type ClientRequest = FastifyRequest;

export type RegisterInput = {
  phone: string;
  password: string;
  confirmPassword: string;
  deviceFingerprint?: string;
  clientVersion?: string;
};
export type LoginInput = { phone: string; password: string; deviceFingerprint?: string; clientVersion?: string };
export type RedeemInput = { licenseKey: string; deviceFingerprint: string; clientVersion?: string };
export type HeartbeatInput = { deviceFingerprint: string; clientVersion?: string };

const publicUser = (user: Pick<User, 'id' | 'uid' | 'phoneLast4' | 'status' | 'createdAt' | 'lastLoginAt'>) => ({
  id: user.id,
  uid: user.uid,
  phone: `+86******${user.phoneLast4}`,
  status: user.status,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
});

const publicDevice = (device: Pick<Device, 'id' | 'fingerprintHint' | 'status' | 'boundAt' | 'lastSeenAt' | 'clientVersion'>) => ({
  id: device.id,
  fingerprintHint: device.fingerprintHint,
  status: device.status,
  boundAt: device.boundAt,
  lastSeenAt: device.lastSeenAt,
  clientVersion: device.clientVersion,
});

const publicEntitlement = (entitlement: Pick<Entitlement, 'id' | 'status' | 'startsAt' | 'expiresAt' | 'version'> & { plan?: { code: string; name: string; durationDays: number } | null }) => ({
  id: entitlement.id,
  status: entitlement.status,
  startsAt: entitlement.startsAt,
  expiresAt: entitlement.expiresAt,
  version: entitlement.version,
  plan: entitlement.plan ? {
    code: entitlement.plan.code,
    name: entitlement.plan.name,
    durationDays: entitlement.plan.durationDays,
  } : null,
});

const activeEntitlement = (entitlement: Entitlement | null, now: Date): EntitlementStatus => {
  if (!entitlement) return 'NONE';
  if (entitlement.status !== 'ACTIVE' || entitlement.expiresAt <= now) return 'EXPIRED';
  return 'ACTIVE';
};
type EntitlementStatus = 'NONE' | 'EXPIRED' | 'ACTIVE';

export class ClientService {
  constructor(private readonly db: PrismaClient, private readonly config: AppConfig) {}

  async register(input: RegisterInput, request: ClientRequest) {
    const phone = normalizePhone(input.phone);
    validatePassword(input.password);
    if (input.password !== input.confirmPassword) throw conflict('PASSWORD_MISMATCH', 'Passwords do not match');
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);
    const user: User = await this.db.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { phoneNormalized: phone }, select: { id: true } });
      if (existingUser) throw conflict('PHONE_ALREADY_REGISTERED', 'An account for this phone already exists');

      if (input.deviceFingerprint) {
        const fingerprintDigest = this.deviceDigest(input.deviceFingerprint);
        const device = await tx.device.findUnique({
          where: { fingerprintDigest },
          select: { userId: true, status: true },
        });
        if (device?.userId) {
          throw forbidden('DEVICE_NOT_BOUND', 'This device is not available for the account');
        }
        if (device?.status === 'SUSPENDED') {
          throw forbidden('DEVICE_SUSPENDED', 'This device is not available for the account');
        }
      }

      const createdUser = await tx.user.create({
        data: {
          id: newId(),
          uid: `LN-${randomToken(8).toUpperCase().slice(0, 16)}`,
          phoneNormalized: phone,
          phoneLast4: phoneLast4(phone),
          passwordHash,
        },
      });
      await writeAudit(tx, this.config, request, {
        actorType: 'USER', actorId: createdUser.id, action: 'user.register', targetType: 'user', targetId: createdUser.id, result: 'SUCCESS',
      });
      return createdUser;
    }).catch((error: unknown) => {
      if (this.isUniqueError(error)) throw conflict('PHONE_ALREADY_REGISTERED', 'An account for this phone already exists');
      throw error;
    });
    return { user: publicUser(user) };
  }

  async login(input: LoginInput, request: ClientRequest) {
    const phone = normalizePhone(input.phone);
    const user = await this.db.user.findUnique({ where: { phoneNormalized: phone } });
    if (!user) {
      // Keep the failure response intentionally generic. A short, bounded hash
      // prevents a fast path from disclosing whether a phone is registered.
      await argon2.hash(input.password, { ...ARGON2_OPTIONS, timeCost: 1 });
      throw unauthorized('INVALID_CREDENTIALS', 'Phone or password is incorrect');
    }
    const valid = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!valid) {
      await writeAudit(this.db, this.config, request, {
        actorType: 'USER', actorId: user.id, action: 'user.login', targetType: 'user', targetId: user.id, result: 'FAILURE',
      });
      throw unauthorized('INVALID_CREDENTIALS', 'Phone or password is incorrect');
    }
    if (user.status !== 'ACTIVE') throw forbidden('USER_SUSPENDED', 'This account has been suspended');
    let device: Device | null = null;
    if (input.deviceFingerprint) {
      const digest = this.deviceDigest(input.deviceFingerprint);
      device = await this.db.device.findUnique({ where: { fingerprintDigest: digest } });
      if (device?.userId && device.userId !== user.id) {
        throw forbidden('DEVICE_NOT_BOUND', 'This device is not available for the account');
      }
      if (device?.status === 'SUSPENDED') {
        throw forbidden('DEVICE_SUSPENDED', 'This device is not available for the account');
      }
      if (device?.status === 'UNBOUND') {
        device = null;
      }
      if (!device) {
        const boundDevice = await this.db.device.findFirst({
          where: { userId: user.id, status: { in: ['ACTIVE', 'SUSPENDED'] } },
          select: { id: true },
        });
        if (boundDevice) {
          throw conflict('ACCOUNT_DEVICE_LIMIT', 'This account already has a bound device');
        }
      }
    }
    const now = new Date();
    await this.db.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
    const tokens = await this.issueTokenPair(user, device, request.ip);
    const entitlement = await this.getEntitlement(user.id, now);
    await writeAudit(this.db, this.config, request, {
      actorType: 'USER', actorId: user.id, action: 'user.login', targetType: 'user', targetId: user.id, result: 'SUCCESS',
    });
    return {
      ...tokens,
      user: publicUser({ ...user, lastLoginAt: now }),
      device: device ? publicDevice(device) : null,
      entitlement: entitlement ? publicEntitlement(entitlement) : null,
    };
  }

  async refresh(refreshToken: string, request: ClientRequest) {
    const digest = hmacDigest(this.config.refreshTokenHmacSecret, refreshToken);
    const now = new Date();
    const result = await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM refresh_tokens WHERE token_digest = ${digest} LIMIT 1 FOR UPDATE`;
      if (locked.length === 0) throw unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
      const record = await tx.refreshToken.findUnique({ where: { tokenDigest: digest }, include: { user: true, device: true } });
      if (!record) throw unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
      if (record.revokedAt) {
        if (record.replacedBy) {
          await tx.refreshToken.updateMany({ where: { userId: record.userId, familyId: record.familyId, revokedAt: null }, data: { revokedAt: now } });
          await tx.user.update({ where: { id: record.userId }, data: { tokenVersion: { increment: 1 } } });
          throw unauthorized('REFRESH_TOKEN_REUSE', 'Refresh token reuse was detected; sign in again');
        }
        throw unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
      }
      if (record.expiresAt <= now || record.user.status !== 'ACTIVE') {
        await tx.refreshToken.update({ where: { id: record.id }, data: { revokedAt: now } });
        throw unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
      }
      if (record.device && (record.device.status !== 'ACTIVE' || record.device.userId !== record.userId)) {
        await tx.refreshToken.update({ where: { id: record.id }, data: { revokedAt: now } });
        throw forbidden('DEVICE_SUSPENDED', 'This device has been suspended');
      }
      const nextToken = randomToken(48);
      const nextDigest = hmacDigest(this.config.refreshTokenHmacSecret, nextToken);
      await tx.refreshToken.update({ where: { id: record.id }, data: { revokedAt: now, replacedBy: nextDigest, lastUsedAt: now } });
      await tx.refreshToken.create({
        data: {
          id: newId(), userId: record.userId, familyId: record.familyId, tokenDigest: nextDigest,
          expiresAt: new Date(now.getTime() + this.config.refreshTokenTtlDays * 86_400_000),
          ...(record.deviceId ? { deviceId: record.deviceId } : {}),
          createdIpHash: hmacDigest(this.config.ipHmacSecret, request.ip),
        },
      });
      const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId } });
      const device = record.deviceId ? await tx.device.findUnique({ where: { id: record.deviceId } }) : null;
      return { user, device, refreshToken: nextToken };
    }, { isolationLevel: 'Serializable' });
    const accessToken = await issueAccessToken(this.config, {
      sub: result.user.id, uid: result.user.uid, ver: result.user.tokenVersion,
      ...(result.device ? { did: result.device.id, dver: result.device.tokenVersion } : {}),
    });
    return { accessToken, refreshToken: result.refreshToken, tokenType: 'Bearer', expiresIn: this.config.accessTokenTtlSeconds };
  }

  async logout(refreshToken: string | undefined, _request: ClientRequest): Promise<{ ok: true }> {
    if (refreshToken) {
      await this.db.refreshToken.updateMany({ where: { tokenDigest: hmacDigest(this.config.refreshTokenHmacSecret, refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { ok: true };
  }

  async redeem(userId: string, input: RedeemInput, request: ClientRequest) {
    const digest = licenseDigest(this.config.cardHmacSecret, input.licenseKey);
    const fingerprintDigest = this.deviceDigest(input.deviceFingerprint);
    const now = new Date();
    const outcome = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM license_keys WHERE digest = ${digest} LIMIT 1 FOR UPDATE`;
      if (rows.length === 0) throw notFound('LICENSE_KEY_NOT_FOUND', 'License key is invalid');
      const key = await tx.licenseKey.findUnique({ where: { digest }, include: { plan: true, entitlement: true } });
      if (!key) throw notFound('LICENSE_KEY_NOT_FOUND', 'License key is invalid');
      if (key.status === 'REDEEMED') {
        if (key.redeemedByUserId === userId && key.redeemedByDeviceId) {
          const sameDevice = await tx.device.findFirst({ where: { id: key.redeemedByDeviceId, fingerprintDigest } });
          if (sameDevice) {
            const entitlement = await tx.entitlement.findUnique({ where: { id: key.entitlementId ?? '' }, include: { plan: true, device: true } });
            if (entitlement) return { idempotent: true as const, key, entitlement, device: entitlement.device };
          }
        }
        throw conflict('LICENSE_KEY_ALREADY_REDEEMED', 'License key has already been redeemed');
      }
      if (key.status === 'REVOKED') throw conflict('LICENSE_KEY_REVOKED', 'License key has been revoked');
      if (key.expiresAt && key.expiresAt <= now) {
        await tx.licenseKey.update({ where: { id: key.id }, data: { status: 'EXPIRED' } });
        throw conflict('LICENSE_KEY_EXPIRED', 'License key has expired');
      }
      if (key.plan.status !== 'ACTIVE') throw conflict('PLAN_DISABLED', 'This plan is not available for activation');
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw unauthorized();
      if (user.status !== 'ACTIVE') throw forbidden('USER_SUSPENDED', 'This account has been suspended');
      const existingDevice = await tx.device.findUnique({ where: { fingerprintDigest } });
      if (existingDevice && existingDevice.userId && existingDevice.userId !== userId) throw conflict('DEVICE_BOUND_OTHER_USER', 'This device is already bound to another account');
      if (existingDevice?.status === 'SUSPENDED') throw forbidden('DEVICE_SUSPENDED', 'This device has been suspended');
      const accountDevices = await tx.device.count({ where: { userId, status: { in: ['ACTIVE', 'SUSPENDED'] } } });
      if (!existingDevice && accountDevices > 0) throw conflict('ACCOUNT_DEVICE_LIMIT', 'This account already has a bound device');
      const device = existingDevice
        ? existingDevice.status === 'UNBOUND' && !existingDevice.userId
          ? await tx.device.update({
            where: { id: existingDevice.id },
            data: { userId, status: 'ACTIVE', boundAt: now, unboundAt: null, clientVersion: input.clientVersion },
          })
          : existingDevice
        : await tx.device.create({
          data: { id: newId(), fingerprintDigest, fingerprintHint: fingerprintDigest.slice(-8), userId, status: 'ACTIVE', boundAt: now, clientVersion: input.clientVersion },
        });
      if (device.userId !== userId) throw conflict('DEVICE_BOUND_OTHER_USER', 'This device is already bound to another account');
      const existingEntitlement = await tx.entitlement.findUnique({ where: { userId }, include: { plan: true, device: true } });
      if (existingEntitlement && existingEntitlement.deviceId !== device.id && existingEntitlement.status === 'ACTIVE' && existingEntitlement.expiresAt > now) {
        throw conflict('ACCOUNT_DEVICE_LIMIT', 'This account already has an active entitlement on another device');
      }
      const startsAt = existingEntitlement && existingEntitlement.expiresAt > now ? existingEntitlement.startsAt : now;
      const base = existingEntitlement && existingEntitlement.expiresAt > now ? existingEntitlement.expiresAt : now;
      const expiresAt = new Date(base.getTime() + key.plan.durationDays * 86_400_000);
      const entitlement = existingEntitlement
        ? await tx.entitlement.update({ where: { id: existingEntitlement.id }, data: { deviceId: device.id, planId: key.planId, status: 'ACTIVE', startsAt, expiresAt, version: { increment: 1 }, revokedAt: null, reason: null }, include: { plan: true, device: true } })
        : await tx.entitlement.create({ data: { id: newId(), userId, deviceId: device.id, planId: key.planId, status: 'ACTIVE', startsAt, expiresAt }, include: { plan: true, device: true } });
      await tx.device.update({ where: { id: device.id }, data: { userId, status: 'ACTIVE', boundAt: device.boundAt ?? now, unboundAt: null, clientVersion: input.clientVersion ?? device.clientVersion } });
      await tx.licenseKey.update({ where: { id: key.id }, data: { status: 'REDEEMED', redeemedAt: now, redeemedByUserId: userId, redeemedByDeviceId: device.id, entitlementId: entitlement.id } });
      await writeAudit(tx, this.config, request, { actorType: 'USER', actorId: userId, action: 'license.redeem', targetType: 'license_key', targetId: key.id, result: 'SUCCESS', metadata: { planCode: key.plan.code } });
      return { idempotent: false as const, key, entitlement, device };
    }, { isolationLevel: 'Serializable' }).catch((error: unknown) => {
      if (this.isSerializationError(error)) throw conflict('REDEEM_RETRY', 'The key was being redeemed concurrently; retry the request');
      throw error;
    });
    const entitlement = outcome.entitlement;
    const offlineLease = await this.offlineToken(userId, entitlement, outcome.device, now, input.deviceFingerprint);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    await this.db.refreshToken.updateMany({
      where: { userId, deviceId: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const tokens = await this.issueTokenPair(user, outcome.device, request.ip);
    return {
      ...tokens,
      idempotent: outcome.idempotent,
      entitlement: publicEntitlement(entitlement),
      device: publicDevice(outcome.device),
      offlineLicenseJws: offlineLease.jws,
      offlineUntil: offlineLease.offlineUntil,
      heartbeatAfterSeconds: this.config.heartbeatIntervalSeconds,
      licenseKeyId: this.config.licenseJwsKeyId,
    };
  }

  async heartbeat(userId: string, claims: AccessClaims | undefined, input: HeartbeatInput, request: ClientRequest) {
    const fingerprintDigest = this.deviceDigest(input.deviceFingerprint);
    const now = new Date();
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized();
    if (user.status !== 'ACTIVE') throw forbidden('USER_SUSPENDED', 'This account has been suspended');
    const device = await this.db.device.findUnique({ where: { fingerprintDigest } });
    if (!device || device.userId !== userId || device.status !== 'ACTIVE') {
      throw forbidden(device?.status === 'SUSPENDED' ? 'DEVICE_SUSPENDED' : 'DEVICE_NOT_BOUND', 'This device is not authorized');
    }
    if (claims?.did && claims.did !== device.id) throw forbidden('DEVICE_MISMATCH', 'The access token is for another device');
    if (claims?.dver !== undefined && claims.dver !== device.tokenVersion) throw unauthorized('SESSION_INVALIDATED', 'Session has been invalidated');
    const entitlement = await this.db.entitlement.findUnique({ where: { userId }, include: { plan: true, device: true } });
    if (!entitlement || activeEntitlement(entitlement, now) !== 'ACTIVE' || entitlement.deviceId !== device.id) {
      throw forbidden('ENTITLEMENT_INACTIVE', 'Membership is not active on this device');
    }
    const updatedDevice = await this.db.device.update({ where: { id: device.id }, data: { lastSeenAt: now, clientVersion: input.clientVersion ?? device.clientVersion, lastIpHash: hmacDigest(this.config.ipHmacSecret, request.ip) } });
    const offlineLease = await this.offlineToken(userId, entitlement, updatedDevice, now, input.deviceFingerprint);
    return {
      authorized: true,
      serverTime: now.toISOString(),
      nextHeartbeatAt: new Date(now.getTime() + this.config.heartbeatIntervalSeconds * 1000).toISOString(),
      entitlement: publicEntitlement(entitlement),
      device: publicDevice(updatedDevice),
      offlineLicenseJws: offlineLease.jws,
      offlineUntil: offlineLease.offlineUntil,
      heartbeatAfterSeconds: this.config.heartbeatIntervalSeconds,
      licenseKeyId: this.config.licenseJwsKeyId,
    };
  }

  async status(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized();
    const entitlement = await this.db.entitlement.findUnique({ where: { userId }, include: { plan: true, device: true } });
    const devices = await this.db.device.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return { user: publicUser(user), entitlement: entitlement ? publicEntitlement(entitlement) : null, devices: devices.map(publicDevice) };
  }

  private async issueTokenPair(user: User, device: Device | null, ip: string) {
    const refreshToken = randomToken(48);
    await this.db.refreshToken.create({
      data: {
        id: newId(), userId: user.id, tokenDigest: hmacDigest(this.config.refreshTokenHmacSecret, refreshToken), familyId: newId(),
        expiresAt: new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000),
        ...(device ? { deviceId: device.id } : {}),
        createdIpHash: hmacDigest(this.config.ipHmacSecret, ip),
      },
    });
    const accessToken = await issueAccessToken(this.config, {
      sub: user.id, uid: user.uid, ver: user.tokenVersion,
      ...(device ? { did: device.id, dver: device.tokenVersion } : {}),
    });
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: this.config.accessTokenTtlSeconds };
  }

  private async getEntitlement(userId: string, now: Date) {
    const entitlement = await this.db.entitlement.findUnique({ where: { userId }, include: { plan: true, device: true } });
    if (entitlement && entitlement.status === 'ACTIVE' && entitlement.expiresAt <= now) {
      await this.db.entitlement.update({ where: { id: entitlement.id }, data: { status: 'EXPIRED' } });
      return { ...entitlement, status: 'EXPIRED' as const };
    }
    return entitlement;
  }

  private async offlineToken(
    userId: string,
    entitlement: Entitlement & { plan: { code: string; name: string; durationDays: number }; device: Device },
    device: Device,
    now: Date,
    deviceFingerprint: string,
  ): Promise<{ jws: string; offlineUntil: string }> {
    const offlineUntil = new Date(Math.min(entitlement.expiresAt.getTime(), now.getTime() + this.config.offlineGraceHours * 3_600_000));
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { uid: true, tokenVersion: true } });
    const jws = await issueOfflineJws(this.config, {
      v: 1,
      iss: 'logicnest-license-server',
      aud: 'com.logicnest.workhub',
      sub: user.uid,
      did: deviceFingerprint,
      sid: entitlement.id,
      userVersion: user.tokenVersion,
      entitlementVersion: entitlement.version,
      deviceVersion: device.tokenVersion,
      planCode: entitlement.plan.code,
      membershipExpiresAt: entitlement.expiresAt.toISOString(),
      iat: now.toISOString(),
      serverTime: now.toISOString(),
      offlineUntil: offlineUntil.toISOString(),
      heartbeatAfterSeconds: this.config.heartbeatIntervalSeconds,
      jti: newId(),
    });
    return { jws, offlineUntil: offlineUntil.toISOString() };
  }

  private deviceDigest(fingerprint: string): string {
    return hmacDigest(this.config.deviceHmacSecret, fingerprint.trim().slice(0, 512));
  }

  private isUniqueError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
  }

  private isSerializationError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2034';
  }
}

export const licenseKeyForResponse = (value: string) => normalizeLicenseKey(value);
export const createGeneratedKeys = (count: number): string[] => {
  const keys = new Set<string>();
  while (keys.size < count) keys.add(generateLicenseKey());
  return [...keys];
};
