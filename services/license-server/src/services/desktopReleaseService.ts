import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Admin, DesktopReleaseStatus, PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

import { writeAudit } from '../audit.js';
import type { AppConfig } from '../config.js';
import { badRequest, conflict, notFound } from '../errors.js';

const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const platformPattern = /^(win32|darwin|linux)$/;
const archPattern = /^(x64|arm64)$/;

export type ChangeLogInput = { title: string; content: string[] };

export type DesktopReleaseQuery = {
  platform?: string;
  arch?: string;
  status?: DesktopReleaseStatus;
};

type ReleaseRecord = {
  id: string;
  version: string;
  platform: string;
  arch: string;
  changeLogZh: unknown;
  changeLogEn: unknown;
  status: DesktopReleaseStatus;
  publishedAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  asset: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
    sha256: string;
  } | null;
};

export class DesktopReleaseService {
  private readonly storageDir: string;

  constructor(private readonly db: PrismaClient, private readonly config: AppConfig) {
    this.storageDir = path.resolve(config.updateStorageDir);
  }

  async listAdmin(query: DesktopReleaseQuery = {}) {
    const releases = await this.db.desktopRelease.findMany({
      where: {
        ...(query.platform ? { platform: query.platform } : {}),
        ...(query.arch ? { arch: query.arch } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: { asset: true },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return { items: releases.map((release) => serializeRelease(release as ReleaseRecord)) };
  }

  async createDraft(input: {
    version: string;
    platform: string;
    arch: string;
    changeLogZh: ChangeLogInput;
    changeLogEn: ChangeLogInput;
    originalName: string;
    mimeType: string;
    data: Buffer;
  }, actor: Admin, request: FastifyRequest) {
    validateReleaseMetadata(input);
    if (input.data.byteLength > this.config.updateUploadMaxBytes) {
      throw badRequest('DESKTOP_RELEASE_TOO_LARGE', '安装包超过允许的大小');
    }
    if (!input.originalName.toLowerCase().endsWith('.exe')) {
      throw badRequest('DESKTOP_RELEASE_FILE_TYPE_INVALID', '第一版只支持 Windows EXE 安装包');
    }

    const sha256 = createHash('sha256').update(input.data).digest('hex');
    const releaseId = randomUUID();
    const storageKey = `${releaseId}-${randomUUID()}.exe`;
    await mkdir(this.storageDir, { recursive: true });
    const finalPath = this.resolveStoragePath(storageKey);
    const temporaryPath = `${finalPath}.upload`;

    await writeFile(temporaryPath, input.data, { flag: 'wx' });
    try {
      await rename(temporaryPath, finalPath);
      const release = await this.db.desktopRelease.create({
        data: {
          id: releaseId,
          version: input.version,
          platform: input.platform,
          arch: input.arch,
          changeLogZh: input.changeLogZh,
          changeLogEn: input.changeLogEn,
          createdByAdminId: actor.id,
          updatedByAdminId: actor.id,
          asset: {
            create: {
              id: randomUUID(),
              storageKey,
              originalName: input.originalName.slice(0, 255),
              mimeType: input.mimeType || 'application/octet-stream',
              sizeBytes: BigInt(input.data.byteLength),
              sha256,
            },
          },
        },
        include: { asset: true },
      });
      await writeAudit(this.db, this.config, request, {
        actorType: 'ADMIN',
        actorId: actor.id,
        action: 'desktop_release.create',
        targetType: 'desktop_release',
        targetId: releaseId,
        result: 'SUCCESS',
        metadata: { version: input.version, platform: input.platform, arch: input.arch, sha256 },
      });
      return serializeRelease(release as ReleaseRecord);
    } catch (error) {
      await unlink(finalPath).catch(() => undefined);
      throw error;
    }
  }

  async updateDraft(releaseId: string, input: {
    changeLogZh?: ChangeLogInput;
    changeLogEn?: ChangeLogInput;
  }, actor: Admin, request: FastifyRequest) {
    const existing = await this.db.desktopRelease.findUnique({ where: { id: releaseId }, include: { asset: true } });
    if (!existing) throw notFound('DESKTOP_RELEASE_NOT_FOUND', '桌面版本不存在');
    if (existing.status !== 'DRAFT') throw conflict('DESKTOP_RELEASE_NOT_DRAFT', '只有草稿版本可以编辑');
    const updated = await this.db.desktopRelease.update({
      where: { id: releaseId },
      data: {
        ...(input.changeLogZh ? { changeLogZh: input.changeLogZh } : {}),
        ...(input.changeLogEn ? { changeLogEn: input.changeLogEn } : {}),
        updatedByAdminId: actor.id,
      },
      include: { asset: true },
    });
    await writeAudit(this.db, this.config, request, {
      actorType: 'ADMIN', actorId: actor.id, action: 'desktop_release.update',
      targetType: 'desktop_release', targetId: releaseId, result: 'SUCCESS',
    });
    return serializeRelease(updated as ReleaseRecord);
  }

  async publish(releaseId: string, actor: Admin, request: FastifyRequest) {
    const release = await this.db.desktopRelease.findUnique({ where: { id: releaseId }, include: { asset: true } });
    if (!release) throw notFound('DESKTOP_RELEASE_NOT_FOUND', '桌面版本不存在');
    if (!release.asset) throw conflict('DESKTOP_RELEASE_ASSET_MISSING', '桌面版本缺少安装包');
    if (release.status === 'PUBLISHED') return serializeRelease(release as ReleaseRecord);

    const published = await this.db.$transaction(async (tx) => {
      await tx.desktopRelease.updateMany({
        where: { platform: release.platform, arch: release.arch, status: 'PUBLISHED', id: { not: releaseId } },
        data: { status: 'ARCHIVED', updatedByAdminId: actor.id },
      });
      return tx.desktopRelease.update({
        where: { id: releaseId },
        data: { status: 'PUBLISHED', publishedAt: new Date(), withdrawnAt: null, updatedByAdminId: actor.id },
        include: { asset: true },
      });
    });
    await writeAudit(this.db, this.config, request, {
      actorType: 'ADMIN', actorId: actor.id, action: 'desktop_release.publish',
      targetType: 'desktop_release', targetId: releaseId, result: 'SUCCESS',
      metadata: { version: release.version, platform: release.platform, arch: release.arch },
    });
    return serializeRelease(published as ReleaseRecord);
  }

  async withdraw(releaseId: string, actor: Admin, request: FastifyRequest) {
    const release = await this.db.desktopRelease.findUnique({ where: { id: releaseId }, include: { asset: true } });
    if (!release) throw notFound('DESKTOP_RELEASE_NOT_FOUND', '桌面版本不存在');
    if (release.status !== 'PUBLISHED') throw conflict('DESKTOP_RELEASE_NOT_PUBLISHED', '只有已发布版本可以撤回');

    const withdrawn = await this.db.$transaction(async (tx) => {
      const result = await tx.desktopRelease.update({
        where: { id: releaseId },
        data: { status: 'WITHDRAWN', withdrawnAt: new Date(), updatedByAdminId: actor.id },
        include: { asset: true },
      });
      const previous = await tx.desktopRelease.findFirst({
        where: { platform: release.platform, arch: release.arch, status: 'ARCHIVED', id: { not: releaseId } },
        orderBy: [{ publishedAt: 'desc' }],
      });
      if (previous) {
        await tx.desktopRelease.update({
          where: { id: previous.id },
          data: { status: 'PUBLISHED', publishedAt: new Date(), updatedByAdminId: actor.id },
        });
      }
      return result;
    });
    await writeAudit(this.db, this.config, request, {
      actorType: 'ADMIN', actorId: actor.id, action: 'desktop_release.withdraw',
      targetType: 'desktop_release', targetId: releaseId, result: 'SUCCESS',
    });
    return serializeRelease(withdrawn as ReleaseRecord);
  }

  async getLatest(platform: string, arch: string, currentVersion: string) {
    const release = await this.db.desktopRelease.findFirst({
      where: { platform, arch, status: 'PUBLISHED' },
      include: { asset: true },
      orderBy: [{ publishedAt: 'desc' }],
    });
    if (!release || !release.asset || compareVersions(release.version, currentVersion) <= 0) return null;
    return serializeRelease(release as ReleaseRecord);
  }

  async getDownload(releaseId: string) {
    const release = await this.db.desktopRelease.findUnique({ where: { id: releaseId }, include: { asset: true } });
    if (!release || release.status !== 'PUBLISHED' || !release.asset) throw notFound('DESKTOP_RELEASE_NOT_FOUND', '可下载的桌面版本不存在');
    const filePath = this.resolveStoragePath(release.asset.storageKey);
    await readFile(filePath).catch(() => { throw notFound('DESKTOP_RELEASE_FILE_MISSING', '桌面安装包文件缺失'); });
    return {
      stream: createReadStream(filePath),
      fileName: release.asset.originalName,
      mimeType: release.asset.mimeType,
      sizeBytes: Number(release.asset.sizeBytes),
      sha256: release.asset.sha256,
    };
  }

  private resolveStoragePath(storageKey: string): string {
    const resolved = path.resolve(this.storageDir, storageKey);
    if (path.dirname(resolved) !== this.storageDir) throw new Error('Invalid desktop release storage key');
    return resolved;
  }
}

function validateReleaseMetadata(input: { version: string; platform: string; arch: string; changeLogZh: ChangeLogInput; changeLogEn: ChangeLogInput }) {
  if (!versionPattern.test(input.version)) throw badRequest('DESKTOP_RELEASE_VERSION_INVALID', '版本号必须使用三段式格式');
  if (!platformPattern.test(input.platform) || input.platform !== 'win32') throw badRequest('DESKTOP_RELEASE_PLATFORM_INVALID', '第一版只支持 Windows');
  if (!archPattern.test(input.arch) || input.arch !== 'x64') throw badRequest('DESKTOP_RELEASE_ARCH_INVALID', '第一版只支持 x64');
  for (const log of [input.changeLogZh, input.changeLogEn]) {
    if (!log || typeof log.title !== 'string' || log.title.trim().length === 0 || !Array.isArray(log.content)) {
      throw badRequest('DESKTOP_RELEASE_CHANGELOG_INVALID', '更新日志格式无效');
    }
  }
}

function normalizeLog(value: unknown): ChangeLogInput {
  if (!value || typeof value !== 'object') return { title: '', content: [] };
  const record = value as Record<string, unknown>;
  return {
    title: typeof record.title === 'string' ? record.title : '',
    content: Array.isArray(record.content) ? record.content.filter((item): item is string => typeof item === 'string') : [],
  };
}

function serializeRelease(release: ReleaseRecord) {
  return {
    id: release.id,
    version: release.version,
    platform: release.platform,
    arch: release.arch,
    changeLogZh: normalizeLog(release.changeLogZh),
    changeLogEn: normalizeLog(release.changeLogEn),
    status: release.status,
    publishedAt: release.publishedAt?.toISOString() ?? null,
    withdrawnAt: release.withdrawnAt?.toISOString() ?? null,
    createdAt: release.createdAt.toISOString(),
    updatedAt: release.updatedAt.toISOString(),
    asset: release.asset ? {
      id: release.asset.id,
      originalName: release.asset.originalName,
      mimeType: release.asset.mimeType,
      sizeBytes: Number(release.asset.sizeBytes),
      sha256: release.asset.sha256,
    } : null,
  };
}

function compareVersions(left: string, right: string): number {
  const parseVersion = (value: string) => {
    const [baseVersion = ''] = value.split('-');
    return baseVersion.split('.').map((part) => Number.parseInt(part, 10) || 0);
  };
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const leftPart = a[index] ?? 0;
    const rightPart = b[index] ?? 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
}
