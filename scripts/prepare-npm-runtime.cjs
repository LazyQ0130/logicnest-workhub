'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.join(__dirname, '..');
const sourceRoot = path.join(repositoryRoot, 'node_modules', 'npm');
const targetRoot = path.join(repositoryRoot, 'resources', 'npm-runtime');
const required = [
  'bin/npm-cli.js',
  'bin/npx-cli.js',
  'node_modules/graceful-fs',
  'node_modules/@npmcli/arborist',
  'node_modules/npm-registry-fetch',
  'node_modules/cacache',
];

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`[prepare-npm-runtime] missing source npm runtime: ${sourceRoot}`);
}

fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
fs.cpSync(sourceRoot, targetRoot, {
  recursive: true,
  force: true,
  dereference: true,
  filter: source => !source.includes(`${path.sep}test${path.sep}`)
    && !source.includes(`${path.sep}tests${path.sep}`)
    && !source.endsWith('.test.js')
    && !source.endsWith('.spec.js'),
});

const missing = required.filter(relativePath => !fs.existsSync(path.join(targetRoot, relativePath)));
if (missing.length > 0) {
  throw new Error(`[prepare-npm-runtime] incomplete runtime; missing: ${missing.join(', ')}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(targetRoot, 'package.json'), 'utf8'));
console.log(`[prepare-npm-runtime] prepared npm@${packageJson.version} at ${targetRoot}`);
