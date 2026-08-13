import { createHash } from 'node:crypto';

import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';

import { parseCatalogArchive } from '../src/services/catalogService.js';

async function archiveFor(manifest: unknown, files: Record<string, string> = {}) {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  for (const [name, value] of Object.entries(files)) zip.file(name, value);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function payloadAsset(path: string, data: string) {
  const bytes = Buffer.from(data);
  return {
    role: 'PAYLOAD', path, mimeType: 'application/zip', sizeBytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

describe('catalog archive validation', () => {
  test('accepts a valid skill payload', async () => {
    const archive = await archiveFor({
      schemaVersion: 1,
      items: [{ kind: 'SKILL', slug: 'demo-skill', version: '1.0.0', nameZh: '演示能力', descriptionZh: '用于验证目录导入的演示能力。', assets: [payloadAsset('demo.zip', 'payload')] }],
    }, { 'demo.zip': 'payload' });
    await expect(parseCatalogArchive(archive)).resolves.toMatchObject([{ slug: 'demo-skill', assets: [{ role: 'PAYLOAD', originalName: 'demo.zip' }] }]);
  });

  test('rejects missing manifest and unsafe paths', async () => {
    const noManifest = await new JSZip().file('payload.zip', 'x').generateAsync({ type: 'nodebuffer' });
    await expect(parseCatalogArchive(noManifest)).rejects.toMatchObject({ code: 'CATALOG_MANIFEST_MISSING' });
    const archive = await archiveFor({
      schemaVersion: 1,
      items: [{ kind: 'KIT', slug: 'unsafe-kit', version: '1.0.0', nameZh: '不安全方案', descriptionZh: '用于验证路径穿越保护的方案。', assets: [payloadAsset('../escape.zip', 'payload')] }],
    }, { '../escape.zip': 'payload' });
    await expect(parseCatalogArchive(archive)).rejects.toMatchObject({ code: 'CATALOG_ASSET_PATH_INVALID' });
  });

  test('rejects missing Chinese metadata, bad hashes, and missing payload contract', async () => {
    const missingZh = await archiveFor({ schemaVersion: 1, items: [{ kind: 'SKILL', slug: 'missing-name', version: '1.0.0', descriptionZh: '描述足够长但缺少名称。', assets: [] }] });
    await expect(parseCatalogArchive(missingZh)).rejects.toMatchObject({ code: 'CATALOG_MANIFEST_INVALID' });
    const badHash = await archiveFor({
      schemaVersion: 1,
      items: [{ kind: 'SKILL', slug: 'bad-hash', version: '1.0.0', nameZh: '错误哈希', descriptionZh: '用于验证资源哈希校验的能力。', assets: [{ ...payloadAsset('bad.zip', 'payload'), sha256: '0'.repeat(64) }] }],
    }, { 'bad.zip': 'payload' });
    await expect(parseCatalogArchive(badHash)).rejects.toMatchObject({ code: 'CATALOG_ASSET_INTEGRITY_FAILED' });
    const missingPayload = await archiveFor({ schemaVersion: 1, items: [{ kind: 'KIT', slug: 'no-payload', version: '1.0.0', nameZh: '无资源方案', descriptionZh: '用于验证主资源必填规则的方案。', assets: [] }] });
    await expect(parseCatalogArchive(missingPayload)).rejects.toMatchObject({ code: 'CATALOG_PAYLOAD_REQUIRED' });
  });

  test('requires connector server configuration', async () => {
    const archive = await archiveFor({ schemaVersion: 1, items: [{ kind: 'CONNECTOR', slug: 'missing-config', version: '1.0.0', nameZh: '缺少配置连接', descriptionZh: '用于验证连接配置必填规则。', metadata: {}, assets: [] }] });
    await expect(parseCatalogArchive(archive)).rejects.toMatchObject({ code: 'CATALOG_CONNECTOR_CONFIG_REQUIRED' });
  });
});
