import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogProvider } from './catalogProvider';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);
const mockedMkdir = vi.mocked(mkdir);

const catalogItem = {
  id: '11111111-1111-1111-1111-111111111111',
  releaseId: '22222222-2222-2222-2222-222222222222',
  kind: 'KIT' as const,
  slug: 'engineering',
  version: '1.1.0',
  nameZh: '工枢·研发协作',
  descriptionZh: '研发协作工作流',
  sortOrder: 30,
  tags: ['专家方案'],
  metadata: {},
  status: 'PUBLISHED' as const,
  assets: [],
};

describe('CatalogProvider.list', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedMkdir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);
  });

  it('fetches the catalog without an ETag when no cache exists', async () => {
    mockedReadFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const fetchCatalog = vi.fn().mockResolvedValue({ items: [catalogItem], etag: 'catalog-v1' });
    const provider = new CatalogProvider({
      controller: { fetchCatalog } as never,
      cacheDirectory: 'C:/catalog-cache',
      downloadDirectory: 'C:/catalog-downloads',
    });

    await expect(provider.list('KIT')).resolves.toEqual({ items: [catalogItem], offline: false });
    expect(fetchCatalog).toHaveBeenCalledWith('KIT', undefined);
    expect(mockedWriteFile).toHaveBeenCalledTimes(1);
  });

  it('uses the existing cache after a catalog request failure', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({ etag: 'catalog-v1', items: [catalogItem] }));
    const fetchCatalog = vi.fn().mockRejectedValue(new Error('network unavailable'));
    const provider = new CatalogProvider({
      controller: { fetchCatalog } as never,
      cacheDirectory: 'C:/catalog-cache',
      downloadDirectory: 'C:/catalog-downloads',
    });

    await expect(provider.list('KIT')).resolves.toEqual({ items: [catalogItem], offline: true });
    expect(fetchCatalog).toHaveBeenCalledWith('KIT', 'catalog-v1');
  });

  it('fails without a cache so the caller can provide its built-in offline store', async () => {
    mockedReadFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const fetchCatalog = vi.fn().mockRejectedValue(new Error('network unavailable'));
    const provider = new CatalogProvider({
      controller: { fetchCatalog } as never,
      cacheDirectory: 'C:/catalog-cache',
      downloadDirectory: 'C:/catalog-downloads',
    });

    await expect(provider.list('KIT')).rejects.toThrow('network unavailable');
  });
});
