'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

// npm --prefix installs nested services but can still invoke the root
// package's prepare hook. Husky belongs to the repository root only.
const prefix = process.env.npm_config_prefix;
const repositoryRoot = path.resolve(__dirname, '..');
if (prefix && path.resolve(prefix) !== repositoryRoot) {
  process.exit(0);
}

execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['husky'], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});
