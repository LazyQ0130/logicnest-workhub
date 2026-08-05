import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AdminRole, PrismaClient } from '@prisma/client';
import type { AppConfig } from '../config.js';
import { forbidden } from '../errors.js';
import { parse, paginationSchema, optionalDate } from '../validation.js';
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_CSRF_HEADER,
  ADMIN_SESSION_COOKIE,
  AdminService,
  canRole,
  type AdminAuth,
} from '../services/adminService.js';

const loginSchema = z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(8).max(128) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(8).max(128), newPassword: z.string().min(8).max(128) });
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().max(255).optional() });
const resetPasswordSchema = z.object({ newPassword: z.string().min(8).max(128) });
const unbindSchema = z.object({ deviceId: z.string().uuid().optional(), reason: z.string().max(255).optional() });
const planCreateSchema = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,32}$/), name: z.string().trim().min(1).max(80), durationDays: z.coerce.number().int().min(1).max(3650) });
const planUpdateSchema = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,32}$/).optional(), name: z.string().trim().min(1).max(80).optional(), durationDays: z.coerce.number().int().min(1).max(3650).optional(), status: z.enum(['ACTIVE', 'DISABLED']).optional() });
const generateSchema = z.object({ planId: z.string().uuid(), count: z.coerce.number().int().min(1).max(1000), expiresAt: optionalDate });
const revokeSchema = z.object({ status: z.literal('REVOKED').optional(), reason: z.string().max(255).optional() });
const auditQuerySchema = paginationSchema.extend({ actorType: z.enum(['USER', 'ADMIN', 'SYSTEM']).optional(), action: z.string().max(80).optional(), targetType: z.string().max(64).optional() });
const userQuerySchema = paginationSchema.extend({ search: z.string().max(64).optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional() });
const keyQuerySchema = paginationSchema.extend({ status: z.enum(['UNUSED', 'REDEEMED', 'REVOKED', 'EXPIRED']).optional(), planId: z.string().uuid().optional(), batchId: z.string().uuid().optional(), search: z.string().max(32).optional() });
const deviceQuerySchema = paginationSchema.extend({ status: z.enum(['ACTIVE', 'SUSPENDED', 'UNBOUND']).optional(), search: z.string().max(32).optional() });

const cookieOptions = (config: AppConfig, httpOnly: boolean) => ({
  httpOnly,
  secure: config.requireHttps,
  sameSite: 'strict' as const,
  path: '/api/v1/admin',
  maxAge: config.adminSessionTtlHours * 3600,
});

const setSessionCookies = (reply: FastifyReply, config: AppConfig, sessionToken: string, csrfToken: string) => {
  reply.setCookie(ADMIN_SESSION_COOKIE, sessionToken, cookieOptions(config, true));
  reply.setCookie(ADMIN_CSRF_COOKIE, csrfToken, cookieOptions(config, false));
};

const clearSessionCookies = (reply: FastifyReply, config: AppConfig) => {
  reply.clearCookie(ADMIN_SESSION_COOKIE, { ...cookieOptions(config, true), maxAge: 0 });
  reply.clearCookie(ADMIN_CSRF_COOKIE, { ...cookieOptions(config, false), maxAge: 0 });
};

const assertOriginForLogin = (request: FastifyRequest, config: AppConfig) => {
  const origin = request.headers.origin;
  if (!origin || !config.allowedOrigins.includes(origin)) throw forbidden('ORIGIN_FORBIDDEN', 'Request origin is not allowed');
};

const requireAdmin = (service: AdminService, mutation: boolean) => async (request: FastifyRequest) => {
  const csrf = request.headers[ADMIN_CSRF_HEADER] ?? request.cookies[ADMIN_CSRF_COOKIE];
  const csrfValue = Array.isArray(csrf) ? csrf[0] : csrf;
  const auth = await service.authenticate(request.cookies[ADMIN_SESSION_COOKIE], request, csrfValue, mutation);
  request.adminAuth = { adminId: auth.admin.id, role: auth.admin.role, mustChangePassword: auth.admin.mustChangePassword, sessionId: auth.sessionId, csrfToken: csrfValue ?? '' };
};

const authFromRequest = async (service: AdminService, request: FastifyRequest, mutation: boolean): Promise<AdminAuth> => {
  const csrf = request.headers[ADMIN_CSRF_HEADER] ?? request.cookies[ADMIN_CSRF_COOKIE];
  const csrfValue = Array.isArray(csrf) ? csrf[0] : csrf;
  return service.authenticate(request.cookies[ADMIN_SESSION_COOKIE], request, csrfValue, mutation);
};

const getAdmin = async (db: PrismaClient, request: FastifyRequest) => {
  const adminId = request.adminAuth?.adminId;
  if (!adminId) throw forbidden('ADMIN_SESSION_REQUIRED', 'Administrator session is required');
  const admin = await db.admin.findUnique({ where: { id: adminId } });
  if (!admin) throw forbidden('ADMIN_SESSION_INVALID', 'Administrator session is invalid');
  return admin;
};

const ensurePasswordChanged = (request: FastifyRequest) => {
  if (request.adminAuth?.mustChangePassword) throw forbidden('ADMIN_PASSWORD_CHANGE_REQUIRED', 'Change the administrator password before continuing');
};

const roles = (...allowed: AdminRole[]) => async (request: FastifyRequest) => {
  if (!request.adminAuth || !canRole(request.adminAuth.role, allowed)) throw forbidden('ADMIN_FORBIDDEN', 'Insufficient administrator permissions');
};

export const registerAdminRoutes = async (app: FastifyInstance, options: { db: PrismaClient; config: AppConfig; service?: AdminService }) => {
  const service = options.service ?? new AdminService(options.db, options.config);

  app.post('/auth/login', { config: { rateLimit: { max: options.config.qaE2e ? 200 : 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    assertOriginForLogin(request, options.config);
    const credentials = parse(loginSchema, request.body);
    const result = await service.login(credentials.username, credentials.password, request);
    setSessionCookies(reply, options.config, result.sessionToken, result.csrfToken);
    return { admin: result.admin, csrfToken: result.csrfToken };
  });
  app.get('/auth/me', { preHandler: requireAdmin(service, false) }, async (request) => {
    const admin = await getAdmin(options.db, request);
    return { admin: { id: admin.id, username: admin.username, role: admin.role, status: admin.status, mustChangePassword: admin.mustChangePassword, createdAt: admin.createdAt, lastLoginAt: admin.lastLoginAt }, csrfToken: request.adminAuth?.csrfToken || request.cookies[ADMIN_CSRF_COOKIE] || null };
  });
  app.post('/auth/change-password', { preHandler: requireAdmin(service, true) }, async (request, reply) => {
    const auth = await authFromRequest(service, request, true);
    const credentials = parse(changePasswordSchema, request.body);
    const result = await service.changePassword(auth, credentials.currentPassword, credentials.newPassword, request);
    setSessionCookies(reply, options.config, result.sessionToken, result.csrfToken);
    return { admin: result.admin, csrfToken: result.csrfToken };
  });
  app.post('/auth/logout', { preHandler: requireAdmin(service, true) }, async (request, reply) => {
    const auth = await authFromRequest(service, request, true);
    const result = await service.logout(auth, request);
    clearSessionCookies(reply, options.config);
    return result;
  });

  const readAdmin = requireAdmin(service, false);
  const writeAdmin = requireAdmin(service, true);

  app.get('/dashboard', { preHandler: [readAdmin, roles('SUPER_ADMIN', 'OPERATOR', 'AUDITOR')] }, async (request) => { ensurePasswordChanged(request); return service.dashboard(); });
  app.get('/users', { preHandler: [readAdmin, roles('SUPER_ADMIN', 'OPERATOR', 'AUDITOR')] }, async (request) => { ensurePasswordChanged(request); return service.listUsers(parse(userQuerySchema, request.query)); });
  app.get('/users/:id', { preHandler: [readAdmin, roles('SUPER_ADMIN', 'OPERATOR', 'AUDITOR')] }, async (request) => { ensurePasswordChanged(request); return service.getUser((request.params as { id: string }).id); });
  app.patch('/users/:id/status', { preHandler: [writeAdmin, roles('SUPER_ADMIN', 'OPERATOR')] }, async (request) => { ensurePasswordChanged(request); const actor = await getAdmin(options.db, request); return service.setUserStatus((request.params as { id: string }).id, parse(statusSchema, request.body).status, request, actor); });
  app.post('/users/:id/reset-password', { preHandler: [writeAdmin, roles('SUPER_ADMIN', 'OPERATOR')] }, async (request) => { ensurePasswordChanged(request); const actor = await getAdmin(options.db, request); return service.resetUserPassword((request.params as { id: string }).id, parse(resetPasswordSchema, request.body).newPassword, request, actor); });
  app.post('/users/:id/unbind-device', { preHandler: [writeAdmin, roles('SUPER_ADMIN', 'OPERATOR')] }, async (request) => { ensurePasswordChanged(request); const actor = await getAdmin(options.db, request); const body = parse(unbindSchema, request.body ?? {}); return service.unbindUserDevice((request.params as { id: string }).id, body.deviceId, body.reason, request, actor); });

  app.get('/plans', { preHandler: [readAdmin, roles('SUPER_ADMIN', 'OPERATOR', 'AUDITOR')] }, async (request) => { ensurePasswordChanged(request); return service.listPlans(); });
  app.post('/plans', { preHandler: [writeAdmin, roles('SUPER_ADMIN', 'OPERATOR')] }, async (request) => { ensurePasswordChanged(request); const actor = await getAdmin(options.db, request); return service.createPlan(parse(planCreateSchema, request.body), request, actor); });
  app.patch('/plans/:id', { preHandler: [writeAdmin, roles('SUPER_ADMIN', 'OPERATOR')] }, async (request) => { ensurePasswordChanged(request); const actor = await getAdmin(options.db, request); return service.updatePlan((request.params as { id: string }).id, parse(planUpdateSchema, request.body), request, actor); });
  app.delete('/plans/:id', { preHandler: [writeAdmin, roles('SUPER_ADMIN')] }, async (request) => { ensurePasswordChanged(request); const actor = await getAdmin(options.db, request); return service.deletePlan((request.params as { id: string }).id, request, actor); });

  app.get('/license-keys', { preHandler: [readAdmin, roles('SUPER_ADMIN', 'OPERATOR', 'AUDITOR')] }, async (request) => { ensurePasswordChanged(request); return service.listKeys(parse(keyQuerySchema, request.query)); });
  app.post('/license-keys/batches', { preHandler: [writeAdmin, roles('SUPER_ADMIN', 'OPERATOR')] }, async (request) => { ensurePasswordChanged(request); const actor = await getAdmin(options.db, request); return service.generateKeys(parse(generateSchema, request.body), request, actor); });
  app.patch('/license-keys/:id/status', { preHandler: [writeAdmin, roles('SUPER_ADMIN', 'OPERATOR')] }, async (request) => { ensurePasswordChanged(request); const actor = await getAdmin(options.db, request); const body = parse(revokeSchema, request.body ?? {}); return service.revokeKey((request.params as { id: string }).id, body.reason, request, actor); });

  app.get('/devices', { preHandler: [readAdmin, roles('SUPER_ADMIN', 'OPERATOR', 'AUDITOR')] }, async (request) => { ensurePasswordChanged(request); return service.listDevices(parse(deviceQuerySchema, request.query)); });
  app.patch('/devices/:id/status', { preHandler: [writeAdmin, roles('SUPER_ADMIN', 'OPERATOR')] }, async (request) => { ensurePasswordChanged(request); const actor = await getAdmin(options.db, request); const body = parse(statusSchema, request.body); return service.setDeviceStatus((request.params as { id: string }).id, body.status, body.reason, request, actor); });
  app.post('/devices/:id/unbind', { preHandler: [writeAdmin, roles('SUPER_ADMIN', 'OPERATOR')] }, async (request) => { ensurePasswordChanged(request); const actor = await getAdmin(options.db, request); const body = parse(unbindSchema, request.body ?? {}); return service.unbindDevice((request.params as { id: string }).id, body.reason, request, actor); });
  app.post('/devices/:id/invalidate-sessions', { preHandler: [writeAdmin, roles('SUPER_ADMIN', 'OPERATOR')] }, async (request) => { ensurePasswordChanged(request); const actor = await getAdmin(options.db, request); return service.invalidateDeviceSessions((request.params as { id: string }).id, request, actor); });

  app.get('/audit-logs', { preHandler: [readAdmin, roles('SUPER_ADMIN', 'AUDITOR')] }, async (request) => { ensurePasswordChanged(request); return service.listAuditLogs(parse(auditQuerySchema, request.query)); });
};

export { setSessionCookies, clearSessionCookies, requireAdmin };
