const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync, randomBytes } = require('node:crypto');

const repositoryRoot = path.resolve(__dirname, '..');
const serviceDirectory = path.join(repositoryRoot, 'services', 'license-server');
const secretDirectory = path.join(serviceDirectory, '.dev-secrets');
const serviceEnvPath = path.join(serviceDirectory, '.env');
const clientEnvPath = path.join(repositoryRoot, '.env.license-dev');
const privateKeyPath = path.join(secretDirectory, 'license-private.pem');
const publicKeyPath = path.join(secretDirectory, 'license-public.pem');
const generatedPaths = [serviceEnvPath, clientEnvPath, privateKeyPath, publicKeyPath];

const existingPaths = generatedPaths.filter((targetPath) => fs.existsSync(targetPath));
if (existingPaths.length > 0) {
  console.error('[LicenseDev] Initialization stopped because local secret files already exist.');
  console.error('[LicenseDev] Preserve them and use the existing environment, or remove each intended file manually before regenerating.');
  process.exitCode = 1;
  return;
}

const secret = (bytes = 48) => randomBytes(bytes).toString('base64url');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' });
const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' });
const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

const mysqlPassword = secret(36);
const mysqlRootPassword = secret(36);
const adminUsername = `logicnest-dev-${randomBytes(4).toString('hex')}`;
const adminPassword = secret(24);

const serviceEnv = [
  'NODE_ENV=development',
  'LOG_LEVEL=info',
  'HOST=0.0.0.0',
  'PORT=8787',
  'LICENSE_SERVER_PORT=8787',
  'ADMIN_WEB_PORT=4175',
  'MYSQL_DATABASE=logicnest_license',
  'MYSQL_USER=logicnest',
  `MYSQL_PASSWORD=${mysqlPassword}`,
  `MYSQL_ROOT_PASSWORD=${mysqlRootPassword}`,
  `DATABASE_URL=mysql://logicnest:${mysqlPassword}@mysql:3306/logicnest_license`,
  'ALLOWED_ORIGINS=http://127.0.0.1:4175',
  'TRUST_PROXY=false',
  'REQUIRE_HTTPS=false',
  `JWT_SECRET=${secret()}`,
  `REFRESH_TOKEN_HMAC_SECRET=${secret()}`,
  `ADMIN_SESSION_HMAC_SECRET=${secret()}`,
  `CARD_HMAC_SECRET=${secret()}`,
  `DEVICE_HMAC_SECRET=${secret()}`,
  `IP_HMAC_SECRET=${secret()}`,
  `LICENSE_JWS_PRIVATE_KEY_B64=${privateKeyDer}`,
  `LICENSE_JWS_PUBLIC_KEY_B64=${publicKeyDer}`,
  'LICENSE_JWS_KEY_ID=logicnest-license-dev-1',
  'ACCESS_TOKEN_TTL_SECONDS=900',
  'REFRESH_TOKEN_TTL_DAYS=30',
  'ADMIN_SESSION_TTL_HOURS=12',
  'OFFLINE_GRACE_HOURS=72',
  'HEARTBEAT_INTERVAL_SECONDS=300',
  'ONLINE_WINDOW_SECONDS=600',
  `ADMIN_BOOTSTRAP_USERNAME=${adminUsername}`,
  `ADMIN_BOOTSTRAP_PASSWORD=${adminPassword}`,
  '',
].join('\n');

const clientEnv = [
  'LOGICNEST_LICENSE_API_URL=http://127.0.0.1:8787/api/v1',
  `LOGICNEST_LICENSE_PUBLIC_KEY_B64=${publicKeyDer}`,
  'LOGICNEST_HEARTBEAT_INTERVAL_SECONDS=300',
  'LOGICNEST_OFFLINE_GRACE_HOURS=72',
  '',
].join('\n');

fs.mkdirSync(secretDirectory, { recursive: true });
fs.writeFileSync(privateKeyPath, privateKeyPem, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
fs.writeFileSync(publicKeyPath, publicKeyPem, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
fs.writeFileSync(serviceEnvPath, serviceEnv, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
fs.writeFileSync(clientEnvPath, clientEnv, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

console.log('[LicenseDev] Local environment and Ed25519 development keys created.');
console.log('[LicenseDev] Secret values were not printed. Keep the generated files local and untracked.');
console.log('[LicenseDev] Next: npm run license:dev:up');
