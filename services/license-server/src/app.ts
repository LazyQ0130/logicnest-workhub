import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from './config.js';
import { closeDb, createDb } from './db.js';
import { AppError, isAppError, publicErrorMessage } from './errors.js';
import { assertHttps } from './security.js';
import { registerClientRoutes } from './routes/client.js';
import { registerAdminRoutes } from './routes/admin.js';
import { ClientService } from './services/clientService.js';
import { AdminService } from './services/adminService.js';
import { CatalogService } from './services/catalogService.js';
import { DesktopReleaseService } from './services/desktopReleaseService.js';

export type AppDependencies = {
  db?: PrismaClient;
  clientService?: ClientService;
  adminService?: AdminService;
  catalogService?: CatalogService;
  desktopReleaseService?: DesktopReleaseService;
};

const RATE_LIMIT_ERROR_CODE = 'RATE_LIMITED';

export const buildApp = async (config: AppConfig, dependencies: AppDependencies = {}): Promise<FastifyInstance> => {
  const loggerOptions: FastifyServerOptions['logger'] = {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization', 'req.headers.cookie', 'req.headers.x-csrf-token',
        'req.body.password', 'req.body.confirmPassword', 'req.body.currentPassword', 'req.body.newPassword',
        'req.body.refreshToken', 'req.body.licenseKey', 'req.body.deviceFingerprint', 'req.body.csv',
      ],
      censor: '[REDACTED]',
    },
  };
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: config.trustProxy,
    genReqId: (request) => {
      const supplied = request.headers['x-request-id'];
      const value = Array.isArray(supplied) ? supplied[0] : supplied;
      return value && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : randomUUID();
    },
  });
  const db = dependencies.db ?? createDb(config);
  const clientService = dependencies.clientService ?? new ClientService(db, config);
  const adminService = dependencies.adminService ?? new AdminService(db, config);
  const catalogService = dependencies.catalogService ?? new CatalogService(db, config);
  const desktopReleaseService = dependencies.desktopReleaseService ?? new DesktopReleaseService(db, config);

  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: request.id } }));
  app.setErrorHandler((error, request, reply) => {
    if (reply.sent) return;
    const rateLimitError = asRateLimitError(error);
    const statusCode = rateLimitError
      ? 429
      : isAppError(error) ? error.statusCode : (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500);
    const code = rateLimitError?.code ?? (isAppError(error) ? error.code : statusCode === 429 ? RATE_LIMIT_ERROR_CODE : 'INTERNAL_ERROR');
    const message = isAppError(error) ? error.message : statusCode === 429 ? 'Too many requests' : publicErrorMessage(error);
    if (statusCode >= 500) app.log.error({ err: error, requestId: request.id }, '[license-server] request failed');
    else app.log.warn({ code, requestId: request.id }, '[license-server] request rejected');
    const body: { error: { code: string; message: string; requestId: string; details?: unknown } } = { error: { code, message, requestId: request.id } };
    if (isAppError(error) && error.details) body.error.details = error.details;
    return reply.code(statusCode).send(body);
  });

  await app.register(sensible);
  await app.register(cookie);
  await app.register(multipart, {
    limits: { files: 1, fields: 12, fileSize: Math.max(config.catalogUploadMaxBytes, config.updateUploadMaxBytes) },
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: config.requireHttps ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
  });
  await app.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.includes(origin)) return callback(null, true);
      const error = new AppError(403, 'ORIGIN_FORBIDDEN', 'Request origin is not allowed');
      return callback(error, false);
    },
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => ({ error: { code: 'RATE_LIMITED', message: `Too many requests; retry in ${context.after}`, requestId: '' } }),
  });

  app.addHook('onRequest', async (request) => {
    if (config.qaE2e && request.headers['x-logicnest-qa-fault'] === '500') {
      throw new Error('QA fault injection');
    }
    assertHttps(request, config.requireHttps);
    request.originAllowed = !request.headers.origin || config.allowedOrigins.includes(request.headers.origin);
  });
  app.addHook('onSend', async (request, reply, payload) => {
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    reply.header('X-Request-Id', request.id);
    return payload;
  });
  app.get('/health/live', async () => ({ ok: true, service: 'logicnest-license-server' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { ok: true, database: 'ready' };
    } catch (error) {
      app.log.error({ err: error }, '[license-server] database readiness check failed');
      return reply.code(503).send({ error: { code: 'NOT_READY', message: 'Database is not ready' } });
    }
  });

  await app.register(registerClientRoutes, { prefix: '/api/v1', db, config, service: clientService, catalogService, desktopReleaseService });
  await app.register(registerAdminRoutes, { prefix: '/api/v1/admin', db, config, service: adminService, catalogService, desktopReleaseService });

  app.addHook('onClose', async () => {
    if (!dependencies.db) await closeDb(db);
  });
  return app;
};

function asRateLimitError(error: unknown): { code: string } | null {
  if (!error || typeof error !== 'object' || !('error' in error)) return null;
  const nested = error.error;
  if (!nested || typeof nested !== 'object' || !('code' in nested) || nested.code !== RATE_LIMIT_ERROR_CODE) return null;
  return { code: RATE_LIMIT_ERROR_CODE };
}
