const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const serviceRoot = path.join(repositoryRoot, 'services', 'license-server');
const statePath = path.join(serviceRoot, '.dev-secrets', 'e2e-state.env');
const resultPath = path.join(serviceRoot, '.dev-secrets', 'mysql-integration-result.json');

if (!fs.existsSync(statePath)) fail('QA_STATE_MISSING');
const state = Object.fromEntries(fs.readFileSync(statePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
for (const key of ['MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD', 'MYSQL_DATABASE']) {
  if (!state[key]) fail(`QA_STATE_${key}_MISSING`);
}

const databaseName = `logicnest_it_${Date.now()}_${randomBytes(3).toString('hex')}`;
const mysqlPort = state.MYSQL_PORT || '13316';
const testUrl = mysqlUrl(state.MYSQL_USER, state.MYSQL_PASSWORD, mysqlPort, databaseName);
const applicationUrl = mysqlUrl(state.MYSQL_USER, state.MYSQL_PASSWORD, mysqlPort, state.MYSQL_DATABASE);

run('create-database', 'docker', [
  'exec',
  'logicnest-license-e2e-mysql-e2e-1',
  'mysql',
  '--user=root',
  `--password=${state.MYSQL_ROOT_PASSWORD}`,
  `--execute=CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON \`${databaseName}\`.* TO '${state.MYSQL_USER}'@'%';`,
]);
const npmCli = process.env.npm_execpath;
if (!npmCli) fail('NPM_CLI_MISSING');
run('migrate', process.execPath, [npmCli, 'run', 'db:migrate:deploy'], {
  cwd: serviceRoot,
  env: { ...process.env, DATABASE_URL: testUrl },
});
run('test', process.execPath, [npmCli, 'run', 'test:mysql'], {
  cwd: serviceRoot,
  env: { ...process.env, DATABASE_URL: applicationUrl, TEST_DATABASE_URL: testUrl },
});

fs.writeFileSync(resultPath, `${JSON.stringify({
  status: 'passed',
  executedAt: new Date().toISOString(),
  databaseName,
}, null, 2)}\n`, { mode: 0o600 });
console.log('[LicenseMySQL] Real MySQL migration and persistence integration passed in a new isolated database.');

function mysqlUrl(user, password, port, database) {
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;
}

function run(stage, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) fail(`${stage.toUpperCase().replaceAll('-', '_')}_FAILED`);
}

function fail(code) {
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify({ status: 'failed', code }, null, 2)}\n`, { mode: 0o600 });
  console.error(`[LicenseMySQL] failed (${code})`);
  process.exit(1);
}
