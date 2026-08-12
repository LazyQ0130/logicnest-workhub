import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { LicenseCatalogItem } from '../license/licenseApiClient';
import type { LicenseController } from '../license/licenseController';

export const CATALOG_URL_PREFIX = 'catalog://';

export interface CatalogProviderOptions {
  controller: LicenseController;
  cacheDirectory: string;
  downloadDirectory: string;
}

export class CatalogProvider {
  private readonly cacheDirectory: string;
  private readonly downloadDirectory: string;

  constructor(private readonly options: CatalogProviderOptions) {
    this.cacheDirectory = path.resolve(options.cacheDirectory);
    this.downloadDirectory = path.resolve(options.downloadDirectory);
  }

  async list(kind?: LicenseCatalogItem['kind']): Promise<{ items: LicenseCatalogItem[]; offline: boolean }> {
    const cachePath = this.cachePath(kind);
    const cached = await this.readCache(cachePath).catch((): { items: LicenseCatalogItem[]; etag?: string } => ({
      items: [],
      etag: undefined,
    }));

    // A valid local catalog is usable immediately. Refresh it in the background
    // so a slow or unavailable authorization service can never block the store UI.
    if (cached.items.length > 0) {
      void this.refresh(cachePath, kind, cached.etag).catch((error) => {
        console.warn('[Catalog] background refresh failed; keeping cached catalog', error);
      });
      return { items: cached.items, offline: true };
    }

    return this.refresh(cachePath, kind, undefined);
  }

  private async refresh(
    cachePath: string,
    kind: LicenseCatalogItem['kind'] | undefined,
    etag: string | undefined,
  ): Promise<{ items: LicenseCatalogItem[]; offline: boolean }> {
    const response = await this.options.controller.fetchCatalog(kind, etag);
    if (response.notModified) {
      const cached = await this.readCache(cachePath);
      return { items: cached.items, offline: false };
    }
    await this.writeCache(cachePath, response.etag, response.items);
    return { items: response.items, offline: false };
  }

  async materialize(url: string): Promise<string> {
    const parsed = parseCatalogUrl(url);
    if (!parsed) throw new Error('目录资源标识无效');
    await mkdir(this.downloadDirectory, { recursive: true });
    const asset = await this.options.controller.downloadCatalogAsset(parsed.itemId, parsed.role);
    const digest = createHash('sha256').update(asset.data).digest('hex');
    if (digest !== asset.sha256 || (parsed.sha256 !== undefined && digest !== parsed.sha256)) {
      throw new Error('目录资源校验失败');
    }
    const safeName = path.basename(asset.fileName).replace(/[^\w.-]+/g, '_');
    const outputPath = path.join(this.downloadDirectory, `${parsed.itemId}-${parsed.role}-${digest.slice(0, 12)}-${safeName}`);
    await writeFile(outputPath, asset.data, { flag: 'wx' }).catch(async (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    });
    return outputPath;
  }

  private cachePath(kind?: LicenseCatalogItem['kind']): string {
    return path.join(this.cacheDirectory, `catalog-${kind?.toLowerCase() ?? 'all'}.json`);
  }

  private async readCache(filePath: string): Promise<{ etag?: string; items: LicenseCatalogItem[] }> {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as { etag?: string; items?: LicenseCatalogItem[] };
    return { etag: raw.etag, items: Array.isArray(raw.items) ? raw.items : [] };
  }

  private async writeCache(filePath: string, etag: string | undefined, items: LicenseCatalogItem[]): Promise<void> {
    await mkdir(this.cacheDirectory, { recursive: true });
    await writeFile(filePath, JSON.stringify({ etag, items }), 'utf8');
  }
}

export function toCatalogUrl(item: LicenseCatalogItem, role: string): string {
  const asset = item.assets.find((candidate) => candidate.role === role);
  return `${CATALOG_URL_PREFIX}${encodeURIComponent(item.id)}/${encodeURIComponent(role)}${asset ? `?sha256=${asset.sha256}` : ''}`;
}

export function parseCatalogUrl(value: string): { itemId: string; role: string; sha256?: string } | null {
  if (!value.startsWith(CATALOG_URL_PREFIX)) return null;
  try {
    const url = new URL(value);
    const itemId = decodeURIComponent(url.hostname);
    const role = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!itemId || !role || !/^[0-9a-f-]{36}$/i.test(itemId) || !/^[A-Z0-9_]{2,48}$/.test(role)) return null;
    const sha256 = url.searchParams.get('sha256') || undefined;
    return { itemId, role, ...(sha256 ? { sha256 } : {}) };
  } catch {
    return null;
  }
}
