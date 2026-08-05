'use strict';

const { createPublicKey } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_SCHEMA_VERSION = 1;
const OUTPUT_RELATIVE_PATH = path.join('.license-build', 'license.json');

function createLicenseBuildConfig(env, options = {}) {
  const allowInsecureHttp = env.LOGICNEST_LICENSE_ALLOW_INSECURE_HTTP === '1';
  const apiBaseUrl = validateApiUrl(env.LOGICNEST_LICENSE_API_URL, allowInsecureHttp);
  const publicKeyPem = resolvePublicKeyPem(env, options.repositoryRoot || process.cwd());

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    apiBaseUrl,
    publicKeyPem,
    allowInsecureLoopback: allowInsecureHttp,
  };
}

function generateLicenseBuildConfig(options = {}) {
  const repositoryRoot = options.repositoryRoot || path.join(__dirname, '..');
  const fileValues = readDotEnv(path.join(repositoryRoot, '.env'));
  const env = { ...fileValues, ...process.env, ...(options.env || {}) };
  const config = createLicenseBuildConfig(env, { repositoryRoot });
  const outputPath = path.join(repositoryRoot, OUTPUT_RELATIVE_PATH);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  console.log('[LicenseBuild] validated and generated packaged license configuration.');
  return { config, outputPath };
}

function validateApiUrl(rawValue, allowInsecureHttp) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) {
    throw new Error('[LicenseBuild] LOGICNEST_LICENSE_API_URL is required for packaging.');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('[LicenseBuild] LOGICNEST_LICENSE_API_URL must be an absolute URL.');
  }
  const isInsecureQaUrl = allowInsecureHttp
    && url.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isInsecureQaUrl) {
    throw new Error('[LicenseBuild] packaged authorization requires HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('[LicenseBuild] authorization URL cannot contain credentials, a query, or a fragment.');
  }
  if (!url.pathname.replace(/\/$/, '').endsWith('/api/v1')) {
    throw new Error('[LicenseBuild] authorization URL must end with /api/v1.');
  }
  return url.toString().replace(/\/$/, '');
}

function resolvePublicKeyPem(env, repositoryRoot) {
  let keyInput = normalizePem(env.LOGICNEST_LICENSE_PUBLIC_KEY_PEM);
  const keyFile = typeof env.LOGICNEST_LICENSE_PUBLIC_KEY_FILE === 'string'
    ? env.LOGICNEST_LICENSE_PUBLIC_KEY_FILE.trim()
    : '';
  const keyBase64 = typeof env.LOGICNEST_LICENSE_PUBLIC_KEY_B64 === 'string'
    ? env.LOGICNEST_LICENSE_PUBLIC_KEY_B64.trim()
    : '';

  if (!keyInput && keyFile) {
    const resolvedPath = path.isAbsolute(keyFile) ? keyFile : path.resolve(repositoryRoot, keyFile);
    try {
      keyInput = fs.readFileSync(resolvedPath, 'utf8').trim();
    } catch {
      throw new Error('[LicenseBuild] LOGICNEST_LICENSE_PUBLIC_KEY_FILE could not be read.');
    }
  }
  if (!keyInput && keyBase64) {
    try {
      keyInput = createPublicKey({
        key: Buffer.from(keyBase64, 'base64'),
        format: 'der',
        type: 'spki',
      }).export({ format: 'pem', type: 'spki' }).toString().trim();
    } catch {
      throw new Error('[LicenseBuild] LOGICNEST_LICENSE_PUBLIC_KEY_B64 is not a valid SPKI key.');
    }
  }
  if (!keyInput) {
    throw new Error(
      '[LicenseBuild] an Ed25519 public key is required via LOGICNEST_LICENSE_PUBLIC_KEY_PEM, '
        + 'LOGICNEST_LICENSE_PUBLIC_KEY_FILE, or LOGICNEST_LICENSE_PUBLIC_KEY_B64.',
    );
  }

  try {
    const key = createPublicKey(keyInput);
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error('wrong key type');
    }
    return key.export({ format: 'pem', type: 'spki' }).toString().trim();
  } catch {
    throw new Error('[LicenseBuild] packaged license public key must be a valid Ed25519 public key.');
  }
}

function normalizePem(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\\n/g, '\n');
}

function readDotEnv(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }

  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

module.exports = {
  createLicenseBuildConfig,
  generateLicenseBuildConfig,
  readDotEnv,
};

if (require.main === module) {
  generateLicenseBuildConfig();
}
