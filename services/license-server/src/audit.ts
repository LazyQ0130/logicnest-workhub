import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import type { AppConfig } from './config.js';
import { hmacDigest } from './security.js';

type AuditInput = {
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  result: 'SUCCESS' | 'FAILURE' | 'DENIED';
  metadata?: Record<string, unknown>;
};

const sanitizeMetadata = (input: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined => {
  if (!input) return undefined;
  const forbidden = /password|token|secret|license.?key|phone|fingerprint|authorization|cookie/i;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (forbidden.test(key)) continue;
    if (typeof value === 'string' && value.length > 512) output[key] = `${value.slice(0, 509)}…`;
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null || typeof value === 'string') output[key] = value;
  }
  return output as Prisma.InputJsonValue;
};

export const writeAudit = async (
  db: PrismaClient | Prisma.TransactionClient,
  config: AppConfig,
  request: FastifyRequest,
  input: AuditInput,
): Promise<void> => {
  const data: Prisma.AuditLogUncheckedCreateInput = {
      actorType: input.actorType,
      ...(input.actorId ? { actorId: input.actorId } : {}),
      action: input.action,
      targetType: input.targetType,
      ...(input.targetId ? { targetId: input.targetId } : {}),
      result: input.result,
      requestId: request.id,
      ipHash: hmacDigest(config.ipHmacSecret, request.ip),
  };
  const metadata = sanitizeMetadata(input.metadata);
  if (metadata !== undefined) data.metadata = metadata;
  await db.auditLog.create({ data });
};

export const safeRequestContext = (request: FastifyRequest) => ({ requestId: request.id, method: request.method, url: request.url });
