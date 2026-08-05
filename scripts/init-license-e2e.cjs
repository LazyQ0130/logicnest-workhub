const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync, randomBytes } = require('node:crypto');

const repositoryRoot = path.resolve(__dirname, '..');
const stateDirectory = path.join(repositoryRoot, 'services', 'license-server', '.dev-secrets');
const statePath = path.join(stateDirectory, 'e2e-state.env');

if (fs.existsSync(statePath)) {
  console.error('[LicenseE2E] Initialization stopped because the local QA state file already exists.');
  console.error('[LicenseE2E] Reuse it, or remove that single file manually before creating a new environment.');
  process.exitCode = 1;
  return;
}

const secret = (bytes = 48) => randomBytes(bytes).toString('base64url');
const username = (role) => `qa-${role}-${randomBytes(5).toString('hex')}`;
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

const values = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  LOGICNEST_QA_E2E: '1',
  HOST: '0.0.0.0',
  PORT: '8787',
  LICENSE_SERVER_PORT: '18787',
  ADMIN_WEB_PORT: '14175',
  MYSQL_PORT: '13316',
  MYSQL_DATABASE: 'logicnest_license_e2e',
  MYSQL_USER: 'logicnest_e2e',
  MYSQL_PASSWORD: secret(36),
  MYSQL_ROOT_PASSWORD: secret(36),
  ALLOWED_ORIGINS: 'http://127.0.0.1:14175',
  TRUST_PROXY: 'false',
  REQUIRE_HTTPS: 'false',
  JWT_SECRET: secret(),
  REFRESH_TOKEN_HMAC_SECRET: secret(),
  ADMIN_SESSION_HMAC_SECRET: secret(),
  CARD_HMAC_SECRET: secret(),
  DEVICE_HMAC_SECRET: secret(),
  IP_HMAC_SECRET: secret(),
  LICENSE_JWS_PRIVATE_KEY_B64: privateKeyDer,
  LICENSE_JWS_PUBLIC_KEY_B64: publicKeyDer,
  LICENSE_JWS_KEY_ID: 'logicnest-license-e2e-1',
  ACCESS_TOKEN_TTL_SECONDS: '900',
  REFRESH_TOKEN_TTL_DAYS: '30',
  ADMIN_SESSION_TTL_HOURS: '1',
  OFFLINE_GRACE_HOURS: '1',
  HEARTBEAT_INTERVAL_SECONDS: '30',
  ONLINE_WINDOW_SECONDS: '60',
  ADMIN_BOOTSTRAP_USERNAME: username('super'),
  ADMIN_BOOTSTRAP_PASSWORD: secret(24),
  QA_ADMIN_CURRENT_PASSWORD: '',
  QA_ADMIN_CHANGED_PASSWORD: secret(24),
  QA_OPERATOR_USERNAME: username('operator'),
  QA_OPERATOR_PASSWORD: secret(24),
  QA_AUDITOR_USERNAME: username('auditor'),
  QA_AUDITOR_PASSWORD: secret(24),
  QA_PRIMARY_PHONE: '',
  QA_SECONDARY_PHONE: '',
  QA_USER_PASSWORD: '',
  QA_DEVICE_FINGERPRINT_A: randomBytes(32).toString('hex'),
  QA_DEVICE_FINGERPRINT_B: randomBytes(32).toString('hex'),
  QA_BATCH_ID: '',
  QA_LICENSE_KEY: '',
  QA_USER_DATA_DIR_A: path.join(repositoryRoot, '.work', 'license-e2e', 'user-data-a'),
  QA_USER_DATA_DIR_B: path.join(repositoryRoot, '.work', 'license-e2e', 'user-data-b'),
};
values.QA_ADMIN_CURRENT_PASSWORD = values.ADMIN_BOOTSTRAP_PASSWORD;

fs.mkdirSync(stateDirectory, { recursive: true });
const content = `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
fs.writeFileSync(statePath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

console.log('[LicenseE2E] Isolated QA environment initialized.');
console.log('[LicenseE2E] Credentials, signing material, and future full card codes stay in the ignored QA state file.');
