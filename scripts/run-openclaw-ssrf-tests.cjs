const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const openClawRoot = path.resolve(process.env.OPENCLAW_SRC || path.join(projectRoot, '..', 'openclaw'));
const packagePath = path.join(openClawRoot, 'package.json');
if (!fs.existsSync(packagePath)) {
  throw new Error(`Pinned OpenClaw source is required for SSRF regression tests: ${openClawRoot}`);
}

const desktopPackage = require(path.join(projectRoot, 'package.json'));
const openClawPackage = require(packagePath);
const expectedVersion = String(desktopPackage.openclaw.version).replace(/^v/, '');
if (openClawPackage.version !== expectedVersion) {
  throw new Error(`OpenClaw SSRF test version mismatch: expected ${expectedVersion}, found ${openClawPackage.version}`);
}

const vitestEntry = path.join(openClawRoot, 'node_modules', 'vitest', 'vitest.mjs');
if (!fs.existsSync(vitestEntry)) {
  throw new Error('Install the pinned OpenClaw source dependencies before running SSRF regression tests');
}

const result = spawnSync(process.execPath, [
  vitestEntry,
  'run',
  'src/infra/net/ssrf.test.ts',
  'src/infra/net/ssrf.pinning.test.ts',
  'src/infra/net/fetch-guard.ssrf.test.ts',
], {
  cwd: openClawRoot,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
