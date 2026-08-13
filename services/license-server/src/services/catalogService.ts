import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Admin, CatalogKind, CatalogReleaseStatus, Prisma, PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import JSZip from 'jszip';
import { z } from 'zod';

import { writeAudit } from '../audit.js';
import type { AppConfig } from '../config.js';
import { badRequest, conflict, notFound } from '../errors.js';

const kindSchema = z.enum(['SKILL', 'KIT', 'CONNECTOR']);
const versionSchema = z.string().trim().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/).max(32);
const assetSchema = z.object({
  role: z.string().trim().regex(/^[A-Z0-9_]{2,48}$/),
  path: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().max(536_870_912),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
const manifestItemSchema = z.object({
  kind: kindSchema,
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,95}$/),
  version: versionSchema,
  nameZh: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120).optional(),
  descriptionZh: z.string().trim().min(4).max(4_000),
  descriptionEn: z.string().trim().min(4).max(4_000).optional(),
  sortOrder: z.number().int().min(-100_000).max(100_000).default(0),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  assets: z.array(assetSchema).max(8).default([]),
});
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(manifestItemSchema).min(1).max(100),
});

type Manifest = z.infer<typeof manifestSchema>;
type ManifestItem = Manifest['items'][number];
type PreparedAsset = ManifestItem['assets'][number] & { data: Buffer; originalName: string };
type PreparedItem = Omit<ManifestItem, 'assets'> & { assets: PreparedAsset[] };

export interface CatalogListQuery {
  kind?: CatalogKind;
  status?: CatalogReleaseStatus;
}

export class CatalogService {
  private readonly storageDir: string;

  constructor(private readonly db: PrismaClient, private readonly config: AppConfig) {
    this.storageDir = path.resolve(config.catalogStorageDir);
  }

  async importArchive(buffer: Buffer, actor: Admin, request: FastifyRequest) {
    if (buffer.byteLength > this.config.catalogUploadMaxBytes) {
      throw badRequest('CATALOG_ARCHIVE_TOO_LARGE', '上传包超过允许的大小');
    }
    const prepared = await parseCatalogArchive(buffer);
    await this.assertVersionsAvailable(prepared);
    await mkdir(this.storageDir, { recursive: true });

    const written: string[] = [];
    try {
      const records = prepared.map((item) => ({
        item,
        releaseId: randomUUID(),
        assets: item.assets.map((asset) => ({ asset, id: randomUUID(), storageKey: `${randomUUID()}.blob` })),
      }));
      for (const record of records) {
        for (const assetRecord of record.assets) {
          const finalPath = this.resolveStoragePath(assetRecord.storageKey);
          const temporaryPath = `${finalPath}.upload`;
          await writeFile(temporaryPath, assetRecord.asset.data, { flag: 'wx' });
          await rename(temporaryPath, finalPath);
          written.push(finalPath);
        }
      }

      const created = await this.db.$transaction(async (tx) => {
        const output = [];
        for (const record of records) {
          const item = await tx.catalogItem.upsert({
            where: { kind_slug: { kind: record.item.kind, slug: record.item.slug } },
            update: { sortOrder: record.item.sortOrder },
            create: {
              id: randomUUID(),
              kind: record.item.kind,
              slug: record.item.slug,
              sortOrder: record.item.sortOrder,
            },
          });
          const release = await tx.catalogRelease.create({
            data: {
              id: record.releaseId,
              itemId: item.id,
              version: record.item.version,
              nameZh: record.item.nameZh,
              nameEn: record.item.nameEn,
              descriptionZh: record.item.descriptionZh,
              descriptionEn: record.item.descriptionEn,
              tags: record.item.tags as Prisma.InputJsonValue,
              metadata: record.item.metadata as Prisma.InputJsonValue,
              createdByAdminId: actor.id,
              updatedByAdminId: actor.id,
              assets: {
                create: record.assets.map(({ asset, id, storageKey }) => ({
                  id,
                  role: asset.role,
                  storageKey,
                  originalName: asset.originalName,
                  mimeType: asset.mimeType,
                  sizeBytes: BigInt(asset.sizeBytes),
                  sha256: asset.sha256.toLowerCase(),
                })),
              },
            },
            include: { item: true, assets: true },
          });
          output.push(serializeRelease(release));
        }
        return output;
      });

      await writeAudit(this.db, this.config, request, {
        actorType: 'ADMIN', actorId: actor.id, action: 'catalog.import', targetType: 'catalog_release',
        result: 'SUCCESS', metadata: { count: created.length },
      });
      return { items: created };
    } catch (error) {
      await Promise.all(written.map((file) => unlink(file).catch(() => undefined)));
      throw error;
    }
  }

  async listAdmin(query: CatalogListQuery) {
    const releases = await this.db.catalogRelease.findMany({
      where: {
        ...(query.kind ? { item: { kind: query.kind } } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: { item: true, assets: true },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return { items: releases.map(serializeRelease) };
  }

  async updateDraft(releaseId: string, input: {
    nameZh?: string; nameEn?: string | null; descriptionZh?: string; descriptionEn?: string | null;
    sortOrder?: number; tags?: string[]; metadata?: Record<string, unknown>;
  }, actor: Admin, request: FastifyRequest) {
    const existing = await this.db.catalogRelease.findUnique({ where: { id: releaseId }, include: { item: true } });
    if (!existing) throw notFound('CATALOG_RELEASE_NOT_FOUND', '目录版本不存在');
    if (existing.status !== 'DRAFT') throw conflict('CATALOG_RELEASE_NOT_DRAFT', '只有草稿版本可以编辑');
    const updated = await this.db.$transaction(async (tx) => {
      if (input.sortOrder !== undefined) await tx.catalogItem.update({ where: { id: existing.itemId }, data: { sortOrder: input.sortOrder } });
      return tx.catalogRelease.update({
        where: { id: releaseId },
        data: {
          ...(input.nameZh !== undefined ? { nameZh: input.nameZh } : {}),
          ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
          ...(input.descriptionZh !== undefined ? { descriptionZh: input.descriptionZh } : {}),
          ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
          ...(input.tags !== undefined ? { tags: input.tags as Prisma.InputJsonValue } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
          updatedByAdminId: actor.id,
        },
        include: { item: true, assets: true },
      });
    });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: 'catalog.update', targetType: 'catalog_release', targetId: releaseId, result: 'SUCCESS' });
    return serializeRelease(updated);
  }

  async publish(releaseIds: string[], actor: Admin, request: FastifyRequest) {
    const published = await this.db.$transaction(async (tx) => {
      const output = [];
      for (const releaseId of releaseIds) {
        const release = await tx.catalogRelease.findUnique({ where: { id: releaseId }, include: { item: true } });
        if (!release) throw notFound('CATALOG_RELEASE_NOT_FOUND', '目录版本不存在');
        if (release.status !== 'DRAFT') throw conflict('CATALOG_RELEASE_NOT_DRAFT', `${release.item.slug} 不是草稿版本`);
        await tx.catalogRelease.updateMany({ where: { itemId: release.itemId, status: 'PUBLISHED' }, data: { status: 'ARCHIVED', updatedByAdminId: actor.id } });
        output.push(await tx.catalogRelease.update({
          where: { id: releaseId },
          data: { status: 'PUBLISHED', publishedAt: new Date(), updatedByAdminId: actor.id },
          include: { item: true, assets: true },
        }));
      }
      return output;
    });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: 'catalog.publish', targetType: 'catalog_release', result: 'SUCCESS', metadata: { count: published.length } });
    return { items: published.map(serializeRelease) };
  }

  async archive(releaseIds: string[], actor: Admin, request: FastifyRequest) {
    const result = await this.db.catalogRelease.updateMany({
      where: { id: { in: releaseIds }, status: { in: ['DRAFT', 'PUBLISHED'] } },
      data: { status: 'ARCHIVED', updatedByAdminId: actor.id },
    });
    await writeAudit(this.db, this.config, request, { actorType: 'ADMIN', actorId: actor.id, action: 'catalog.archive', targetType: 'catalog_release', result: 'SUCCESS', metadata: { count: result.count } });
    return { archived: result.count };
  }

  async listPublished(kind?: CatalogKind) {
    const releases = await this.db.catalogRelease.findMany({
      where: { status: 'PUBLISHED', ...(kind ? { item: { kind } } : {}) },
      include: { item: true, assets: true },
      orderBy: [{ item: { sortOrder: 'asc' } }, { publishedAt: 'desc' }],
    });
    return releases.map(serializeRelease);
  }

  async getPublishedAsset(itemId: string, role: string) {
    const asset = await this.db.catalogAsset.findFirst({
      where: { role, release: { itemId, status: 'PUBLISHED' } },
      include: { release: true },
      orderBy: { release: { publishedAt: 'desc' } },
    });
    if (!asset) throw notFound('CATALOG_ASSET_NOT_FOUND', '目录资源不存在');
    const filePath = this.resolveStoragePath(asset.storageKey);
    await readFile(filePath, { flag: 'r' }).catch(() => { throw notFound('CATALOG_ASSET_FILE_MISSING', '目录资源文件缺失'); });
    return {
      stream: createReadStream(filePath),
      fileName: asset.originalName,
      mimeType: asset.mimeType,
      sizeBytes: Number(asset.sizeBytes),
      sha256: asset.sha256,
    };
  }

  private resolveStoragePath(storageKey: string): string {
    const resolved = path.resolve(this.storageDir, storageKey);
    if (path.dirname(resolved) !== this.storageDir) throw new Error('Invalid catalog storage key');
    return resolved;
  }

  private async assertVersionsAvailable(items: PreparedItem[]): Promise<void> {
    const keys = new Set<string>();
    for (const item of items) {
      const key = `${item.kind}:${item.slug}:${item.version}`;
      if (keys.has(key)) throw badRequest('CATALOG_DUPLICATE_RELEASE', `上传包包含重复版本：${item.slug} ${item.version}`);
      keys.add(key);
      const existing = await this.db.catalogItem.findUnique({
        where: { kind_slug: { kind: item.kind, slug: item.slug } },
        include: { releases: { select: { version: true } } },
      });
      if (existing?.releases.some((release) => release.version === item.version)) {
        throw conflict('CATALOG_VERSION_EXISTS', `${item.slug} ${item.version} 已存在`);
      }
      const highest = existing?.releases.map((release) => release.version).sort(compareVersions).at(-1);
      if (highest && compareVersions(item.version, highest) <= 0) {
        throw conflict('CATALOG_VERSION_NOT_NEWER', `${item.slug} 的版本必须高于 ${highest}`);
      }
    }
  }
}

export async function parseCatalogArchive(buffer: Buffer): Promise<PreparedItem[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: true, createFolders: false });
  } catch {
    throw badRequest('CATALOG_ARCHIVE_INVALID', '上传文件不是有效的 ZIP 包');
  }
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) throw badRequest('CATALOG_MANIFEST_MISSING', 'ZIP 根目录缺少 manifest.json');
  let raw: unknown;
  try {
    raw = JSON.parse(await manifestEntry.async('text'));
  } catch {
    throw badRequest('CATALOG_MANIFEST_INVALID_JSON', 'manifest.json 不是有效 JSON');
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest('CATALOG_MANIFEST_INVALID', '目录清单校验失败', {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }

  return Promise.all(parsed.data.items.map(async (item) => {
    assertItemContract(item);
    const roles = new Set<string>();
    const assets = await Promise.all(item.assets.map(async (asset): Promise<PreparedAsset> => {
      if (roles.has(asset.role)) throw badRequest('CATALOG_ASSET_ROLE_DUPLICATE', `${item.slug} 的资源角色重复：${asset.role}`);
      roles.add(asset.role);
      assertSafeArchivePath(asset.path);
      const entry = zip.file(asset.path);
      if (!entry || entry.dir) throw badRequest('CATALOG_ASSET_MISSING', `${item.slug} 缺少资源：${asset.path}`);
      const data = await entry.async('nodebuffer');
      const digest = createHash('sha256').update(data).digest('hex');
      if (data.byteLength !== asset.sizeBytes || digest !== asset.sha256.toLowerCase()) {
        throw badRequest('CATALOG_ASSET_INTEGRITY_FAILED', `${item.slug} 的资源校验失败：${asset.path}`);
      }
      return { ...asset, data, originalName: path.posix.basename(asset.path) };
    }));
    return { ...item, assets };
  }));
}

function assertItemContract(item: ManifestItem): void {
  if ((item.kind === 'SKILL' || item.kind === 'KIT') && !item.assets.some((asset) => asset.role === 'PAYLOAD')) {
    throw badRequest('CATALOG_PAYLOAD_REQUIRED', `${item.slug} 必须包含 PAYLOAD 资源`);
  }
  if (item.kind === 'CONNECTOR') {
    const server = item.metadata.server;
    if (!server || typeof server !== 'object' || Array.isArray(server)) {
      throw badRequest('CATALOG_CONNECTOR_CONFIG_REQUIRED', `${item.slug} 缺少 metadata.server 配置`);
    }
  }
}

function assertSafeArchivePath(value: string): void {
  const normalized = path.posix.normalize(value.replace(/\\/g, '/'));
  if (normalized.startsWith('../') || normalized.startsWith('/') || normalized.includes('/../') || /^[A-Za-z]:/.test(normalized)) {
    throw badRequest('CATALOG_ASSET_PATH_INVALID', `资源路径不安全：${value}`);
  }
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => (value.split('-', 1)[0] ?? '0.0.0').split('.').map(Number);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const leftPart = a[index] ?? 0;
    const rightPart = b[index] ?? 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return left.localeCompare(right);
}

function serializeRelease(release: {
  id: string; version: string; nameZh: string; nameEn: string | null; descriptionZh: string; descriptionEn: string | null;
  tags: unknown; metadata: unknown; status: CatalogReleaseStatus; publishedAt: Date | null; createdAt: Date; updatedAt: Date;
  item: { id: string; kind: CatalogKind; slug: string; sortOrder: number };
  assets: Array<{ role: string; originalName: string; mimeType: string; sizeBytes: bigint; sha256: string }>;
}) {
  return {
    id: release.item.id,
    releaseId: release.id,
    kind: release.item.kind,
    slug: release.item.slug,
    version: release.version,
    nameZh: release.nameZh,
    nameEn: release.nameEn,
    descriptionZh: release.descriptionZh,
    descriptionEn: release.descriptionEn,
    sortOrder: release.item.sortOrder,
    tags: Array.isArray(release.tags) ? release.tags : [],
    metadata: release.metadata && typeof release.metadata === 'object' ? release.metadata : {},
    status: release.status,
    publishedAt: release.publishedAt?.toISOString() ?? null,
    createdAt: release.createdAt.toISOString(),
    updatedAt: release.updatedAt.toISOString(),
    assets: release.assets.map((asset) => ({ ...asset, sizeBytes: Number(asset.sizeBytes) })),
  };
}
