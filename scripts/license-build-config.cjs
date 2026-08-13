'use strict';

const { createPublicKey, X509Certificate } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const OUTPUT_RELATIVE_PATH = path.join('.license-build', 'license.json');

function generateLicenseBuildConfig(options = {}) {
  const repositoryRoot = options.repositoryRoot || path.join(__dirname, '..');
  const env = { ...process.env, ...(options.env || {}) };
  const apiBaseUrl = validateApiUrl(env.LOGICNEST_LICENSE_API_URL, env.LOGICNEST_LICENSE_ALLOW_INSECURE_HTTP === '1');
  const publicKeyPem = resolvePublicKey(env, repositoryRoot);
  const trustedCaPem = resolveTrustedCa(env, repositoryRoot);
  const outputPath = path.join(repositoryRoot, OUTPUT_RELATIVE_PATH);
  const config = {
    schemaVersion: 1,
    apiBaseUrl,
    publicKeyPem,
    allowInsecureLoopback: env.LOGICNEST_LICENSE_ALLOW_INSECURE_HTTP === '1',
    ...(trustedCaPem ? { trustedCaPem } : {}),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { config, outputPath };
}

function validateApiUrl(value, allowInsecureLoopback) {
  if (!value?.trim()) throw new Error('[LicenseBuild] LOGICNEST_LICENSE_API_URL is required for packaging.');
  const url = new URL(value.trim());
  const loopback = allowInsecureLoopback
    && url.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) throw new Error('[LicenseBuild] packaged authorization requires HTTPS.');
  if (url.username || url.password || url.search || url.hash || !url.pathname.replace(/\/$/, '').endsWith('/api/v1')) {
    throw new Error('[LicenseBuild] authorization URL must end with /api/v1 and contain no credentials, query, or fragment.');
  }
  return url.toString().replace(/\/$/, '');
}

function resolvePublicKey(env, repositoryRoot) {
  let value = env.LOGICNEST_LICENSE_PUBLIC_KEY_PEM?.trim().replace(/\\n/g, '\n');
  if (!value && env.LOGICNEST_LICENSE_PUBLIC_KEY_FILE?.trim()) {
    const configuredPath = env.LOGICNEST_LICENSE_PUBLIC_KEY_FILE.trim();
    value = fs.readFileSync(path.isAbsolute(configuredPath) ? configuredPath : path.resolve(repositoryRoot, configuredPath), 'utf8').trim();
  }
  if (!value) throw new Error('[LicenseBuild] an Ed25519 public key is required for packaging.');
  const key = createPublicKey(value);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('[LicenseBuild] packaged license public key must be Ed25519.');
  return key.export({ format: 'pem', type: 'spki' }).toString().trim();
}

function resolveTrustedCa(env, repositoryRoot) {
  let value = env.LOGICNEST_LICENSE_CA_PEM?.trim().replace(/\\n/g, '\n');
  if (!value && env.LOGICNEST_LICENSE_CA_FILE?.trim()) {
    const configuredPath = env.LOGICNEST_LICENSE_CA_FILE.trim();
    const resolvedPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(repositoryRoot, configuredPath);
    value = fs.readFileSync(resolvedPath, 'utf8').trim();
  }
  if (!value) return undefined;
  if (/PRIVATE KEY/i.test(value)) {
    throw new Error('[LicenseBuild] authorization trust input must not contain a private key.');
  }
  try {
    const certificate = new X509Certificate(value);
    if (!certificate.ca) throw new Error('not a CA certificate');
    return certificate.toString().trim();
  } catch {
    throw new Error('[LicenseBuild] packaged authorization CA must be a valid CA certificate.');
  }
}

module.exports = { generateLicenseBuildConfig };
