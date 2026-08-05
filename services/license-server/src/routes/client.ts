import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../config.js';
import { forbidden, unauthorized } from '../errors.js';
import { verifyAccessToken } from '../security.js';
import { ClientService } from '../services/clientService.js';
import { parse } from '../validation.js';

const registerSchema = z.object({
  phone: z.string().min(5).max(32),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
  deviceFingerprint: z.string().min(8).max(1024).optional(),
  clientVersion: z.string().max(64).optional(),
});
const loginSchema = z.object({ phone: z.string().min(5).max(32), password: z.string().min(8).max(128), deviceFingerprint: z.string().min(8).max(1024).optional(), clientVersion: z.string().max(64).optional() });
const refreshSchema = z.object({ refreshToken: z.string().min(20).max(256) });
const redeemSchema = z.object({ licenseKey: z.string().min(10).max(64), deviceFingerprint: z.string().min(8).max(1024), clientVersion: z.string().max(64).optional() });
const heartbeatSchema = z.object({ deviceFingerprint: z.string().min(8).max(1024), clientVersion: z.string().max(64).optional() });

const bearer = (request: FastifyRequest): string => {
  const value = request.headers.authorization;
  if (!value || !value.startsWith('Bearer ')) throw unauthorized('ACCESS_TOKEN_REQUIRED', 'Access token is required');
  return value.slice(7).trim();
};

export const requireUser = (db: PrismaClient, config: AppConfig) => async (request: FastifyRequest): Promise<void> => {
  const claims = await verifyAccessToken(config, bearer(request));
  const user = await db.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== claims.ver) throw unauthorized('SESSION_INVALIDATED', 'Session is no longer valid');
  if (claims.did) {
    const device = await db.device.findUnique({ where: { id: claims.did } });
    if (!device || device.userId !== user.id || device.status !== 'ACTIVE' || (claims.dver !== undefined && device.tokenVersion !== claims.dver)) {
      throw forbidden(device?.status === 'SUSPENDED' ? 'DEVICE_SUSPENDED' : 'SESSION_INVALIDATED', 'Device authorization is no longer valid');
    }
  }
  request.auth = claims;
};

export const registerClientRoutes = async (app: FastifyInstance, options: { db: PrismaClient; config: AppConfig; service?: ClientService }) => {
  const service = options.service ?? new ClientService(options.db, options.config);
  const auth = requireUser(options.db, options.config);

  app.post('/auth/register', { config: { rateLimit: { max: options.config.qaE2e ? 200 : 8, timeWindow: '15 minutes' } } }, async (request) => service.register(parse(registerSchema, request.body), request));
  app.post('/auth/login', { config: { rateLimit: { max: options.config.qaE2e ? 200 : 12, timeWindow: '15 minutes' } } }, async (request) => service.login(parse(loginSchema, request.body), request));
  app.post('/auth/refresh', { config: { rateLimit: { max: options.config.qaE2e ? 200 : 30, timeWindow: '15 minutes' } } }, async (request) => {
    const body = parse(refreshSchema, request.body);
    return service.refresh(body.refreshToken, request);
  });
  app.post('/auth/logout', { preHandler: auth }, async (request) => {
    const body = parse(z.object({ refreshToken: z.string().min(20).max(256).optional() }), request.body ?? {});
    return service.logout(body.refreshToken, request);
  });
  app.get('/auth/me', { preHandler: auth }, async (request) => service.status(request.auth!.sub));
  app.get('/license/status', { preHandler: auth }, async (request) => service.status(request.auth!.sub));
  app.post('/license/redeem', { preHandler: auth, config: { rateLimit: { max: options.config.qaE2e ? 200 : 10, timeWindow: '15 minutes' } } }, async (request) => service.redeem(request.auth!.sub, parse(redeemSchema, request.body), request));
  app.post('/license/heartbeat', { preHandler: auth, config: { rateLimit: { max: options.config.qaE2e ? 500 : 30, timeWindow: '5 minutes' } } }, async (request) => service.heartbeat(request.auth!.sub, request.auth, parse(heartbeatSchema, request.body), request));
  app.get('/license/public-key', async () => ({ keyId: options.config.licenseJwsKeyId, algorithm: 'Ed25519', publicKeyPem: options.config.licenseJwsPublicKeyPem, offlineGraceHours: options.config.offlineGraceHours }));
};
