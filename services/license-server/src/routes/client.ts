import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parse } from '../validation.js';
import { forbidden, unauthorized } from '../errors.js';
import { issueAccessToken, verifyAccessToken } from '../security.js';
import type { AppConfig } from '../config.js';
import type { PrismaClient } from '@prisma/client';
import { ClientService } from '../services/clientService.js';
import { CatalogService } from '../services/catalogService.js';
import { DesktopReleaseService } from '../services/desktopReleaseService.js';

const registerSchema = z.object({ phone: z.string().min(5).max(32), password: z.string().min(8).max(128), confirmPassword: z.string().min(8).max(128) });
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

export const registerClientRoutes = async (app: FastifyInstance, options: {
  db: PrismaClient;
  config: AppConfig;
  service?: ClientService;
  catalogService?: CatalogService;
  desktopReleaseService?: DesktopReleaseService;
}) => {
  const service = options.service ?? new ClientService(options.db, options.config);
  const catalogService = options.catalogService ?? new CatalogService(options.db, options.config);
  const desktopReleaseService = options.desktopReleaseService ?? new DesktopReleaseService(options.db, options.config);
  const auth = requireUser(options.db, options.config);

  app.get('/app-updates/check', async (request) => {
    const query = parse(z.object({
      platform: z.enum(['win32']),
      arch: z.enum(['x64']),
      version: z.string().trim().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/).max(64),
      uuid: z.string().max(128).optional(),
      userId: z.string().max(256).optional(),
    }), request.query);
    const release = await desktopReleaseService.getLatest(query.platform, query.arch, query.version);
    if (!release?.asset) return { code: 0, data: {} };
    const origin = `${request.protocol}://${request.headers.host || request.hostname}`;
    return { code: 0, data: { value: {
      version: release.version,
      date: release.publishedAt || release.updatedAt,
      changeLog: { ch: release.changeLogZh, en: release.changeLogEn },
      windowsX64: {
        url: `${origin}/api/v1/app-updates/releases/${encodeURIComponent(release.id)}/download`,
        sha256: release.asset.sha256,
        sizeBytes: release.asset.sizeBytes,
      },
    } } };
  });

  app.get('/app-updates/releases/:id/download', async (request, reply) => {
    const asset = await desktopReleaseService.getDownload(parse(z.object({ id: z.string().uuid() }), request.params).id);
    reply
      .header('Content-Type', asset.mimeType)
      .header('Content-Length', asset.sizeBytes)
      .header('X-Content-SHA256', asset.sha256)
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`)
      .header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(asset.stream);
  });

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
  app.get('/catalog', { preHandler: auth }, async (request, reply) => {
    const query = parse(z.object({ kind: z.enum(['SKILL', 'KIT', 'CONNECTOR']).optional() }), request.query);
    const payload = JSON.stringify({ items: await catalogService.listPublished(query.kind) });
    const etag = `"${createHash('sha256').update(payload).digest('hex')}"`;
    reply.header('ETag', etag).header('Cache-Control', 'private, max-age=0, must-revalidate');
    if (request.headers['if-none-match'] === etag) return reply.code(304).send();
    return JSON.parse(payload);
  });
  app.get('/catalog/:itemId/assets/:role', { preHandler: auth }, async (request, reply) => {
    const entitlement = await options.db.entitlement.findUnique({ where: { userId: request.auth!.sub } });
    if (!entitlement || entitlement.status !== 'ACTIVE' || entitlement.expiresAt.getTime() <= Date.now()) {
      throw forbidden('CATALOG_DOWNLOAD_REQUIRES_LICENSE', '有效会员授权后才能安装目录功能');
    }
    const params = parse(z.object({ itemId: z.string().uuid(), role: z.string().regex(/^[A-Z0-9_]{2,48}$/) }), request.params);
    const asset = await catalogService.getPublishedAsset(params.itemId, params.role);
    reply
      .header('Content-Type', asset.mimeType)
      .header('Content-Length', asset.sizeBytes)
      .header('X-Content-SHA256', asset.sha256)
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`)
      .header('Cache-Control', 'private, no-store');
    return reply.send(asset.stream);
  });
};
