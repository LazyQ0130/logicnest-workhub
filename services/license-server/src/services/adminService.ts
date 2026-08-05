import type { Admin, AdminRole, Prisma, PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import type { FastifyRequest } from 'fastify';

import { writeAudit } from '../audit.js';
import type { AppConfig } from '../config.js';
import { conflict, forbidden, notFound, unauthorized } from '../errors.js';
import {
  hmacDigest,
  keysToCsv,
  newId,
  randomToken,
  safeEqual,
  validatePassword,
} from '../security.js';
import { createGeneratedKeys } from './clientService.js';

const ADMIN_ARGON2_OPTIONS = {
  type: 2 as const,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

type AdminPublic = Pick<Admin, 'id' | 'username' | 'role' | 'status' | 'mustChangePassword' | 'createdAt' | 'lastLoginAt'>;

const publicAdmin = (admin: AdminPublic) => ({
  id: admin.id,
  username: admin.username,
  role: admin.role,
  status: admin.status,
  mustChangePassword: admin.mustChangePassword,
  createdAt: admin.createdAt,
  lastLoginAt: admin.lastLoginAt,
});

export type AdminAuth = {
  admin: Admin;
  sessionId: string;
  csrfToken: string;
};

export const ADMIN_SESSION_COOKIE = 'ln_admin_session';
export const ADMIN_CSRF_COOKIE = 'ln_admin_csrf';
export const ADMIN_CSRF_HEADER = 'x-csrf-token';

export class AdminService {
  constructor(private readonly db: PrismaClient, private readonly config: AppConfig) {}

  async bootstrap(username: string, password: string): Promise<{ created: boolean; admin: ReturnType<typeof publicAdmin> }> {
    validatePassword(password);
    if (password.length < 12) throw conflict('WEAK_ADMIN_PASSWORD', 'Bootstrap administrator password must be at least 12 characters');
    const existing = await this.db.admin.findUnique({ where: { username } });
    if (existing) return { created: false, admin: publicAdmin(existing) };
    const admin = await this.db.admin.create({ data: { id: newId(), username, passwordHash: await argon2.hash(password, ADMIN_ARGON2_OPTIONS), role: 'SUPER_ADMIN', mustChangePassword: true } });
    return { created: true, admin: publicAdmin(admin) };
  }

  async login(username: string, password: string, request: FastifyRequest) {
    const admin = await this.db.admin.findUnique({ where: { username } });
    if (!admin) throw unauthorized('INVALID_ADMIN_CREDENTIALS', 'Username or password is incorrect');
    const now = new Date();
    if (admin.lockedUntil && admin.lockedUntil > now) throw forbidden('ADMIN_LOGIN_LOCKED', 'Administrator login is temporarily locked');
    if (admin.status !== 'ACTIVE') throw forbidden('ADMIN_SUSPENDED', 'Administrator account is suspended');
    const valid = await argon2.verify(admin.passwordHash, password).catch(() => false);
    if (!valid) {
      const failures = admin.loginFailures + 1;
      await this.db.admin.update({ where: { id: admin.id }, data: { loginFailures: failures, ...(failures >= 5 ? { lockedUntil: new Date(now.getTime() + 15 * 60_000) } : {}) } });
      await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: admin.id, action: 'admin.login', targetType: 'admin', targetId: admin.id, result: 'FAILURE' });
      throw unauthorized('INVALID_ADMIN_CREDENTIALS', 'Username or password is incorrect');
    }
    await this.db.admin.update({ where: { id: admin.id }, data: { loginFailures: 0, lockedUntil: null, lastLoginAt: now } });
    const session = await this.createSession(admin, request.ip);
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: admin.id, action: 'admin.login', targetType: 'admin', targetId: admin.id, result: 'SUCCESS' });
    return { ...session, admin: publicAdmin({ ...admin, lastLoginAt: now }) };
  }

  async authenticate(sessionToken: string | undefined, request: FastifyRequest, csrfToken: string | undefined, mutation: boolean): Promise<AdminAuth> {
    if (!sessionToken) throw unauthorized('ADMIN_SESSION_REQUIRED', 'Administrator session is required');
    const digest = hmacDigest(this.config.adminSessionHmacSecret, sessionToken);
    const session = await this.db.adminSession.findUnique({ where: { sessionDigest: digest }, include: { admin: true } });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now || session.admin.sessionVersion !== session.sessionVersion || session.admin.status !== 'ACTIVE') {
      throw unauthorized('ADMIN_SESSION_INVALID', 'Administrator session is invalid or expired');
    }
    if (mutation) {
      this.assertOrigin(request);
      if (!csrfToken || !this.safeTokenDigest(csrfToken, session.csrfDigest)) throw forbidden('CSRF_INVALID', 'CSRF token is missing or invalid');
    }
    await this.db.adminSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    return { admin: session.admin, sessionId: session.id, csrfToken: csrfToken ?? '' };
  }

  async logout(auth: AdminAuth, request: FastifyRequest): Promise<{ ok: true }> {
    await this.db.adminSession.updateMany({ where: { id: auth.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: auth.admin.id, action: 'admin.logout', targetType: 'admin', targetId: auth.admin.id, result: 'SUCCESS' });
    return { ok: true };
  }

  async changePassword(auth: AdminAuth, currentPassword: string, newPassword: string, request: FastifyRequest) {
    validatePassword(newPassword);
    if (newPassword.length < 12) throw conflict('WEAK_ADMIN_PASSWORD', 'Administrator password must be at least 12 characters');
    if (!(await argon2.verify(auth.admin.passwordHash, currentPassword).catch(() => false))) throw unauthorized('CURRENT_PASSWORD_INVALID', 'Current password is incorrect');
    if (currentPassword === newPassword) throw conflict('PASSWORD_REUSE', 'Choose a different password');
    const passwordHash = await argon2.hash(newPassword, ADMIN_ARGON2_OPTIONS);
    const sessionToken = randomToken(48);
    const csrfToken = randomToken(32);
    const now = new Date();
    const updated = await this.db.$transaction(async (tx) => {
      const admin = await tx.admin.update({ where: { id: auth.admin.id }, data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } } });
      await tx.adminSession.updateMany({ where: { adminId: admin.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.adminSession.create({ data: { id: newId(), adminId: admin.id, sessionDigest: hmacDigest(this.config.adminSessionHmacSecret, sessionToken), csrfDigest: hmacDigest(this.config.adminSessionHmacSecret, csrfToken), sessionVersion: admin.sessionVersion, expiresAt: new Date(now.getTime() + this.config.adminSessionTtlHours * 3_600_000), createdIpHash: hmacDigest(this.config.ipHmacSecret, request.ip) } });
      return admin;
    });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: auth.admin.id, action: 'admin.change_password', targetType: 'admin', targetId: auth.admin.id, result: 'SUCCESS' });
    return { sessionToken, csrfToken, admin: publicAdmin(updated) };
  }

  async dashboard() {
    const now = new Date();
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
    const soon = new Date(now.getTime() + 7 * 86_400_000);
    const [registeredUsers, activeEntitlements, newUsersToday, onlineDevices, expiringSoon] = await Promise.all([
      this.db.user.count(),
      this.db.entitlement.count({ where: { status: 'ACTIVE', expiresAt: { gt: now } } }),
      this.db.user.count({ where: { createdAt: { gte: dayStart } } }),
      this.db.device.count({ where: { status: 'ACTIVE', lastSeenAt: { gte: new Date(now.getTime() - this.config.onlineWindowSeconds * 1000) } } }),
      this.db.entitlement.count({ where: { status: 'ACTIVE', expiresAt: { gt: now, lte: soon } } }),
    ]);
    return { registeredUsers, activeEntitlements, newUsersToday, onlineDevices, expiringSoon };
  }

  async listUsers(query: { page: number; pageSize: number; search?: string; status?: 'ACTIVE' | 'SUSPENDED' }) {
    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [{ uid: { contains: query.search } }, { phoneNormalized: { contains: query.search } }] } : {}),
    };
    const [total, items] = await Promise.all([
      this.db.user.count({ where }),
      this.db.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { entitlement: { include: { plan: true } }, devices: true } }),
    ]);
    return {
      items: items.map((user) => ({ id: user.id, uid: user.uid, phone: user.phoneNormalized, status: user.status, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt, lastOnlineAt: user.devices.reduce<Date | null>((latest, device) => !latest || (device.lastSeenAt && device.lastSeenAt > latest) ? device.lastSeenAt : latest, null), clientVersion: user.devices.find((device) => device.status === 'ACTIVE')?.clientVersion ?? null, entitlement: user.entitlement ? { status: user.entitlement.status, expiresAt: user.entitlement.expiresAt, plan: user.entitlement.plan.code } : null, devices: user.devices.map((device) => ({ id: device.id, fingerprintHint: device.fingerprintHint, status: device.status, lastSeenAt: device.lastSeenAt, clientVersion: device.clientVersion })) })),
      total, page: query.page, pageSize: query.pageSize,
    };
  }

  async getUser(id: string) {
    const user = await this.db.user.findUnique({ where: { id }, include: { entitlement: { include: { plan: true } }, devices: true } });
    if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
    return { id: user.id, uid: user.uid, phone: user.phoneNormalized, status: user.status, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt, entitlement: user.entitlement ? { ...user.entitlement, plan: user.entitlement.plan } : null, devices: user.devices.map((device) => ({ id: device.id, fingerprintHint: device.fingerprintHint, status: device.status, boundAt: device.boundAt, unboundAt: device.unboundAt, lastSeenAt: device.lastSeenAt, clientVersion: device.clientVersion })) };
  }

  async setUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', request: FastifyRequest, actor: Admin) {
    const user = await this.db.user.update({ where: { id }, data: { status, tokenVersion: { increment: 1 } } }).catch((error: unknown) => { if (this.isNotFound(error)) throw notFound('USER_NOT_FOUND', 'User not found'); throw error; });
    await this.db.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: `user.${status.toLowerCase()}`, targetType: 'user', targetId: id, result: 'SUCCESS', metadata: { status } });
    return { id: user.id, status: user.status };
  }

  async resetUserPassword(id: string, newPassword: string, request: FastifyRequest, actor: Admin) {
    validatePassword(newPassword);
    const passwordHash = await argon2.hash(newPassword, ADMIN_ARGON2_OPTIONS);
    const user = await this.db.user.update({ where: { id }, data: { passwordHash, passwordResetAt: new Date(), tokenVersion: { increment: 1 } } }).catch((error: unknown) => { if (this.isNotFound(error)) throw notFound('USER_NOT_FOUND', 'User not found'); throw error; });
    await this.db.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: 'user.reset_password', targetType: 'user', targetId: id, result: 'SUCCESS' });
    return { id: user.id, ok: true };
  }

  async unbindUserDevice(userId: string, deviceId: string | undefined, reason: string | undefined, request: FastifyRequest, actor: Admin) {
    const device = await this.db.device.findFirst({ where: { userId, ...(deviceId ? { id: deviceId } : { status: { in: ['ACTIVE', 'SUSPENDED'] } }) }, orderBy: { boundAt: 'asc' } });
    if (!device) throw notFound('DEVICE_NOT_FOUND', 'Bound device not found');
    await this.unbindDevice(device.id, reason, request, actor);
    return { id: device.id, status: 'UNBOUND' as const };
  }

  async listPlans() { return this.db.plan.findMany({ orderBy: { durationDays: 'asc' }, include: { _count: { select: { licenseKeys: true, entitlements: true } } } }); }

  async createPlan(input: { code: string; name: string; durationDays: number }, request: FastifyRequest, actor: Admin) {
    const plan = await this.db.plan.create({ data: { id: newId(), code: input.code.toUpperCase(), name: input.name, durationDays: input.durationDays } }).catch((error: unknown) => { if (this.isUniqueError(error)) throw conflict('PLAN_CODE_EXISTS', 'Plan code already exists'); throw error; });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: 'plan.create', targetType: 'plan', targetId: plan.id, result: 'SUCCESS', metadata: { code: plan.code } });
    return plan;
  }

  async updatePlan(id: string, input: { code?: string; name?: string; durationDays?: number; status?: 'ACTIVE' | 'DISABLED' }, request: FastifyRequest, actor: Admin) {
    const plan = await this.db.plan.update({ where: { id }, data: { ...(input.code ? { code: input.code.toUpperCase() } : {}), ...(input.name ? { name: input.name } : {}), ...(input.durationDays ? { durationDays: input.durationDays } : {}), ...(input.status ? { status: input.status } : {}) } }).catch((error: unknown) => { if (this.isNotFound(error)) throw notFound('PLAN_NOT_FOUND', 'Plan not found'); if (this.isUniqueError(error)) throw conflict('PLAN_CODE_EXISTS', 'Plan code already exists'); throw error; });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: 'plan.update', targetType: 'plan', targetId: id, result: 'SUCCESS' });
    return plan;
  }

  async deletePlan(id: string, request: FastifyRequest, actor: Admin) {
    const [keys, entitlements] = await Promise.all([this.db.licenseKey.count({ where: { planId: id } }), this.db.entitlement.count({ where: { planId: id } })]);
    if (keys || entitlements) throw conflict('PLAN_IN_USE', 'Plan is referenced by license keys or entitlements');
    await this.db.plan.delete({ where: { id } }).catch((error: unknown) => { if (this.isNotFound(error)) throw notFound('PLAN_NOT_FOUND', 'Plan not found'); throw error; });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: 'plan.delete', targetType: 'plan', targetId: id, result: 'SUCCESS' });
    return { ok: true };
  }

  async generateKeys(input: { planId: string; count: number; expiresAt?: Date }, request: FastifyRequest, actor: Admin) {
    if (input.count < 1 || input.count > 1000) throw conflict('BATCH_LIMIT', 'A batch may contain between 1 and 1000 keys');
    const plan = await this.db.plan.findUnique({ where: { id: input.planId } });
    if (!plan) throw notFound('PLAN_NOT_FOUND', 'Plan not found');
    const batchId = newId();
    const generated: Array<{ key: string; digest: string; lastFour: string }> = [];
    const seen = new Set<string>();
    while (generated.length < input.count) {
      const key = createGeneratedKeys(1)[0];
      if (!key) continue;
      const digest = hmacDigest(this.config.cardHmacSecret, key);
      if (seen.has(digest)) continue;
      seen.add(digest);
      const exists = await this.db.licenseKey.findUnique({ where: { digest }, select: { id: true } });
      if (!exists) generated.push({ key, digest, lastFour: key.slice(-4) });
    }
    await this.db.$transaction(async (tx) => {
      await tx.licenseBatch.create({ data: { id: batchId, planId: plan.id, createdByAdminId: actor.id, count: generated.length, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}) } });
      await tx.licenseKey.createMany({ data: generated.map((item) => ({ id: newId(), batchId, planId: plan.id, digest: item.digest, lastFour: item.lastFour, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}) })) });
      await writeAudit(tx, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: 'license.generate', targetType: 'license_batch', targetId: batchId, result: 'SUCCESS', metadata: { count: generated.length, planCode: plan.code } });
    });
    const keys = generated.map((item) => ({ key: item.key, planCode: plan.code, expiresAt: input.expiresAt ?? null }));
    return { batch: { id: batchId, planId: plan.id, planCode: plan.code, count: generated.length, expiresAt: input.expiresAt ?? null }, keys: keys.map((item) => item.key), csv: keysToCsv(keys) };
  }

  async listKeys(query: { page: number; pageSize: number; status?: 'UNUSED' | 'REDEEMED' | 'REVOKED' | 'EXPIRED'; planId?: string; batchId?: string; search?: string }) {
    const where: Prisma.LicenseKeyWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.planId ? { planId: query.planId } : {}), ...(query.batchId ? { batchId: query.batchId } : {}), ...(query.search ? { lastFour: { contains: query.search.toUpperCase().slice(-4) } } : {}) };
    const [total, items] = await Promise.all([this.db.licenseKey.count({ where }), this.db.licenseKey.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { plan: true, batch: true } })]);
    return { items: items.map((key) => ({ id: key.id, lastFour: key.lastFour, status: key.status, plan: { id: key.plan.id, code: key.plan.code, name: key.plan.name }, batchId: key.batchId, expiresAt: key.expiresAt, redeemedAt: key.redeemedAt, redeemedByUserId: key.redeemedByUserId, redeemedByDeviceId: key.redeemedByDeviceId, createdAt: key.createdAt })), total, page: query.page, pageSize: query.pageSize };
  }

  async revokeKey(id: string, reason: string | undefined, request: FastifyRequest, actor: Admin) {
    const key = await this.db.licenseKey.findUnique({ where: { id } });
    if (!key) throw notFound('LICENSE_KEY_NOT_FOUND', 'License key not found');
    if (key.status === 'REDEEMED' && key.entitlementId) await this.db.entitlement.update({ where: { id: key.entitlementId }, data: { status: 'REVOKED', revokedAt: new Date(), reason: reason ?? 'license key revoked', version: { increment: 1 } } }).catch(() => undefined);
    const updated = await this.db.licenseKey.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: reason ?? null } });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: 'license.revoke', targetType: 'license_key', targetId: id, result: 'SUCCESS' });
    return { id: updated.id, status: updated.status };
  }

  async listDevices(query: { page: number; pageSize: number; status?: 'ACTIVE' | 'SUSPENDED' | 'UNBOUND'; search?: string }) {
    const search = query.search?.trim();
    const maskedFingerprint = search?.match(/^([^…]+)…([^…]+)$/u);
    const where: Prisma.DeviceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search ? {
        OR: [
          { fingerprintHint: { contains: search.slice(-16) } },
          ...(maskedFingerprint ? [{
            AND: [
              { fingerprintHint: { startsWith: maskedFingerprint[1] } },
              { fingerprintHint: { endsWith: maskedFingerprint[2] } },
            ],
          }] : []),
          { user: { is: { uid: { contains: search } } } },
          { lastIpHash: hmacDigest(this.config.ipHmacSecret, search) },
        ],
      } : {}),
    };
    const [total, items] = await Promise.all([this.db.device.count({ where }), this.db.device.findMany({ where, orderBy: { lastSeenAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { user: { select: { id: true, uid: true, phoneNormalized: true } }, entitlement: true } })]);
    return { items: items.map((device) => ({ id: device.id, fingerprintHint: device.fingerprintHint, status: device.status, user: device.user ? { id: device.user.id, uid: device.user.uid, phone: device.user.phoneNormalized } : null, boundAt: device.boundAt, unboundAt: device.unboundAt, lastSeenAt: device.lastSeenAt, clientVersion: device.clientVersion, entitlementExpiresAt: device.entitlement?.expiresAt ?? null })), total, page: query.page, pageSize: query.pageSize };
  }

  async setDeviceStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string | undefined, request: FastifyRequest, actor: Admin) {
    const device = await this.db.device.update({ where: { id }, data: { status, tokenVersion: { increment: 1 } } }).catch((error: unknown) => { if (this.isNotFound(error)) throw notFound('DEVICE_NOT_FOUND', 'Device not found'); throw error; });
    await this.db.refreshToken.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: `device.${status.toLowerCase()}`, targetType: 'device', targetId: id, result: 'SUCCESS' });
    return { id: device.id, status: device.status };
  }

  async unbindDevice(id: string, reason: string | undefined, request: FastifyRequest, actor: Admin) {
    const device = await this.db.device.findUnique({ where: { id } });
    if (!device) throw notFound('DEVICE_NOT_FOUND', 'Device not found');
    await this.db.$transaction(async (tx) => {
      await tx.device.update({ where: { id }, data: { userId: null, status: 'UNBOUND', unboundAt: new Date(), tokenVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.entitlement.updateMany({ where: { deviceId: id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date(), reason: reason ?? 'device unbound', version: { increment: 1 } } });
      await writeAudit(tx, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: 'device.unbind', targetType: 'device', targetId: id, result: 'SUCCESS' });
    });
    return { id, status: 'UNBOUND' as const };
  }

  async invalidateDeviceSessions(id: string, request: FastifyRequest, actor: Admin) {
    const device = await this.db.device.update({ where: { id }, data: { tokenVersion: { increment: 1 } } }).catch((error: unknown) => { if (this.isNotFound(error)) throw notFound('DEVICE_NOT_FOUND', 'Device not found'); throw error; });
    await this.db.refreshToken.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: 'device.invalidate_sessions', targetType: 'device', targetId: id, result: 'SUCCESS' });
    return { id: device.id, tokenVersion: device.tokenVersion };
  }

  async listAuditLogs(query: { page: number; pageSize: number; actorType?: 'USER' | 'ADMIN' | 'SYSTEM'; action?: string; targetType?: string }) {
    const where: Prisma.AuditLogWhereInput = { ...(query.actorType ? { actorType: query.actorType } : {}), ...(query.action ? { action: { contains: query.action } } : {}), ...(query.targetType ? { targetType: query.targetType } : {}) };
    const [total, items] = await Promise.all([this.db.auditLog.count({ where }), this.db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize })]);
    return { items: items.map(serializeAuditLog), total, page: query.page, pageSize: query.pageSize };
  }

  private async createSession(admin: Admin, ip: string) {
    const sessionToken = randomToken(48);
    const csrfToken = randomToken(32);
    await this.db.adminSession.create({ data: { id: newId(), adminId: admin.id, sessionDigest: hmacDigest(this.config.adminSessionHmacSecret, sessionToken), csrfDigest: hmacDigest(this.config.adminSessionHmacSecret, csrfToken), sessionVersion: admin.sessionVersion, expiresAt: new Date(Date.now() + this.config.adminSessionTtlHours * 3_600_000), createdIpHash: hmacDigest(this.config.ipHmacSecret, ip) } });
    return { sessionToken, csrfToken };
  }

  private assertOrigin(request: FastifyRequest) {
    const origin = request.headers.origin;
    if (!origin || !this.config.allowedOrigins.includes(origin)) throw forbidden('ORIGIN_FORBIDDEN', 'Request origin is not allowed');
  }

  private safeTokenDigest(token: string, expectedDigest: string): boolean {
    return safeEqual(hmacDigest(this.config.adminSessionHmacSecret, token), expectedDigest);
  }

  private isUniqueError(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002'; }
  private isNotFound(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2025'; }
}

export const canRole = (role: AdminRole, allowed: AdminRole[]): boolean => allowed.includes(role);

export function serializeAuditLog<T extends { id: bigint }>(
  auditLog: T,
): Omit<T, 'id'> & { id: string } {
  return { ...auditLog, id: auditLog.id.toString() };
}
