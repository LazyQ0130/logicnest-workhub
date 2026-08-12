const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const statePath = path.join(repositoryRoot, 'services', 'license-server', '.dev-secrets', 'e2e-state.env');
const resultPath = path.join(repositoryRoot, 'services', 'license-server', '.dev-secrets', 'e2e-result.json');
const results = [];
let currentStep = 'startup';

main().catch((error) => {
  results.push({ name: currentStep, status: 'failed' });
  writeResult('failed');
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED_ERROR';
  console.error(`[LicenseE2E] failed: ${currentStep} (${code})`);
  process.exitCode = 1;
});

async function main() {
  if (!fs.existsSync(statePath)) throw qaError('QA_STATE_MISSING');
  const state = readState();
  const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  state.QA_BATCH_ID = runId;
  state.QA_PRIMARY_PHONE = randomPhone();
  state.QA_SECONDARY_PHONE = randomPhone();
  while (state.QA_SECONDARY_PHONE === state.QA_PRIMARY_PHONE) state.QA_SECONDARY_PHONE = randomPhone();
  state.QA_USER_PASSWORD = randomBytes(18).toString('base64url');
  state.QA_DEVICE_FINGERPRINT_A = randomBytes(32).toString('hex');
  state.QA_DEVICE_FINGERPRINT_B = randomBytes(32).toString('hex');
  state.QA_DESKTOP_DEVICE_FINGERPRINT = randomBytes(32).toString('hex');
  state.QA_DESKTOP_PHONE = randomPhone();
  state.QA_DESKTOP_PASSWORD = randomBytes(18).toString('base64url');
  state.QA_DESKTOP_LICENSE_KEY = '';
  state.QA_USER_DATA_DIR_A = path.join(repositoryRoot, '.work', 'license-e2e', `user-data-${runId}-a`);
  state.QA_USER_DATA_DIR_B = path.join(repositoryRoot, '.work', 'license-e2e', `user-data-${runId}-b`);
  state.QA_LICENSE_KEY = '';
  state.QA_LICENSE_KEY_2 = '';
  state.QA_LICENSE_KEY_3 = '';
  writeState(state);

  const clientBase = `http://127.0.0.1:${state.LICENSE_SERVER_PORT}/api/v1`;
  const adminBase = `http://127.0.0.1:${state.ADMIN_WEB_PORT}/api/v1/admin`;
  const adminOrigin = `http://127.0.0.1:${state.ADMIN_WEB_PORT}`;

  await step('isolated services and container brand smoke', async () => {
    await expectStatus(`${clientBase.replace('/api/v1', '')}/health/ready`, 200);
    const html = await fetchText(adminOrigin);
    assertIncludes(html, '<title>逻栖工枢 · 运营中心</title>');
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) => match[1]);
    if (!scripts.length) throw qaError('ADMIN_BUNDLE_MISSING');
    const bundles = await Promise.all(scripts.map((source) => fetchText(new URL(source, adminOrigin).toString())));
    const combined = bundles.join('\n');
    for (const phrase of ['运营中心登录', '登录运营中心', '关键操作将记录审计日志']) assertIncludes(combined, phrase);
  });

  const superAdmin = new AdminSession(adminBase, adminOrigin);
  await step('super admin login and first password change', async () => {
    const login = await superAdmin.login(state.ADMIN_BOOTSTRAP_USERNAME, state.QA_ADMIN_CURRENT_PASSWORD);
    if (login.admin?.mustChangePassword) {
      await expectAdminError(superAdmin, '/dashboard', { method: 'GET' }, 403, 'ADMIN_PASSWORD_CHANGE_REQUIRED');
      await superAdmin.request('/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: state.QA_ADMIN_CURRENT_PASSWORD,
          newPassword: state.QA_ADMIN_CHANGED_PASSWORD,
        },
      });
      state.QA_ADMIN_CURRENT_PASSWORD = state.QA_ADMIN_CHANGED_PASSWORD;
      writeState(state);
    }
    const me = await superAdmin.request('/auth/me');
    if (me.admin?.mustChangePassword) throw qaError('PASSWORD_CHANGE_NOT_PERSISTED');
  });

  let dayPlan;
  await step('dashboard and day month year plans', async () => {
    await superAdmin.request('/dashboard');
    const plans = await superAdmin.request('/plans');
    for (const code of ['DAY', 'MONTH', 'YEAR']) {
      if (!plans.some((plan) => plan.code === code)) throw qaError(`PLAN_${code}_MISSING`);
    }
    dayPlan = plans.find((plan) => plan.code === 'DAY');
  });

  let primaryLogin;
  let secondaryLogin;
  await step('registration duplicate phone and password feedback', async () => {
    await api(`${clientBase}/auth/register`, {
      method: 'POST',
      body: { phone: state.QA_PRIMARY_PHONE, password: state.QA_USER_PASSWORD, confirmPassword: state.QA_USER_PASSWORD },
      expectedStatus: 200,
    });
    await expectApiError(`${clientBase}/auth/register`, {
      method: 'POST',
      body: { phone: state.QA_PRIMARY_PHONE, password: state.QA_USER_PASSWORD, confirmPassword: state.QA_USER_PASSWORD },
    }, 409, 'PHONE_ALREADY_REGISTERED');
    await expectApiError(`${clientBase}/auth/login`, {
      method: 'POST',
      body: { phone: state.QA_PRIMARY_PHONE, password: `${state.QA_USER_PASSWORD}x`, deviceFingerprint: state.QA_DEVICE_FINGERPRINT_A },
    }, 401, 'INVALID_CREDENTIALS');
    primaryLogin = await api(`${clientBase}/auth/login`, {
      method: 'POST',
      body: { phone: state.QA_PRIMARY_PHONE, password: state.QA_USER_PASSWORD, deviceFingerprint: state.QA_DEVICE_FINGERPRINT_A, clientVersion: 'qa-e2e' },
      expectedStatus: 200,
    });
    if (primaryLogin.entitlement !== null || primaryLogin.device !== null) throw qaError('UNLICENSED_LOGIN_EXPOSED_CORE');
  });

  await step('invalid and unknown license key feedback', async () => {
    await expectApiError(`${clientBase}/license/redeem`, {
      method: 'POST', accessToken: primaryLogin.accessToken,
      body: { licenseKey: 'invalid-format', deviceFingerprint: state.QA_DEVICE_FINGERPRINT_A, clientVersion: 'qa-e2e' },
    }, 400, 'INVALID_LICENSE_KEY');
    await expectApiError(`${clientBase}/license/redeem`, {
      method: 'POST', accessToken: primaryLogin.accessToken,
      body: { licenseKey: 'LQGX-0000-0000-0000-0000', deviceFingerprint: state.QA_DEVICE_FINGERPRINT_A, clientVersion: 'qa-e2e' },
    }, 404, 'LICENSE_KEY_NOT_FOUND');
  });

  let firstKeyRecord;
  const firstGenerated = await generateDayKey(superAdmin, dayPlan.id, state, 'QA_LICENSE_KEY');
  firstKeyRecord = firstGenerated.record;

  await step('real day-card activation and idempotent retry', async () => {
    currentStep = 'real day-card activation request';
    const activated = await redeem(clientBase, primaryLogin.accessToken, state.QA_LICENSE_KEY, state.QA_DEVICE_FINGERPRINT_A);
    if (activated.entitlement?.status !== 'ACTIVE' || activated.device?.status !== 'ACTIVE') throw qaError('ACTIVATION_NOT_ACTIVE');
    if (!activated.accessToken || !activated.refreshToken) throw qaError('BOUND_TOKEN_PAIR_MISSING');
    primaryLogin = activated;
    currentStep = 'idempotent activation retry';
    const retry = await redeem(clientBase, primaryLogin.accessToken, state.QA_LICENSE_KEY, state.QA_DEVICE_FINGERPRINT_A);
    if (retry.idempotent !== true) throw qaError('REDEEM_NOT_IDEMPOTENT');
    primaryLogin = retry;
    currentStep = 'post-activation heartbeat';
    const heartbeatResult = await heartbeat(clientBase, primaryLogin.accessToken, state.QA_DEVICE_FINGERPRINT_A);
    if (!heartbeatResult.authorized) throw qaError('HEARTBEAT_NOT_AUTHORIZED');
  });

  await step('card cannot be used by another account', async () => {
    await api(`${clientBase}/auth/register`, {
      method: 'POST',
      body: { phone: state.QA_SECONDARY_PHONE, password: state.QA_USER_PASSWORD, confirmPassword: state.QA_USER_PASSWORD },
      expectedStatus: 200,
    });
    secondaryLogin = await api(`${clientBase}/auth/login`, {
      method: 'POST',
      body: { phone: state.QA_SECONDARY_PHONE, password: state.QA_USER_PASSWORD, deviceFingerprint: state.QA_DEVICE_FINGERPRINT_B, clientVersion: 'qa-e2e' },
      expectedStatus: 200,
    });
    await expectApiError(`${clientBase}/license/redeem`, {
      method: 'POST', accessToken: secondaryLogin.accessToken,
      body: { licenseKey: state.QA_LICENSE_KEY, deviceFingerprint: state.QA_DEVICE_FINGERPRINT_B, clientVersion: 'qa-e2e' },
    }, 409, 'LICENSE_KEY_ALREADY_REDEEMED');
  });

  await step('one account rejects a second device fingerprint', async () => {
    await expectApiError(`${clientBase}/auth/login`, {
      method: 'POST',
      body: { phone: state.QA_PRIMARY_PHONE, password: state.QA_USER_PASSWORD, deviceFingerprint: state.QA_DEVICE_FINGERPRINT_B, clientVersion: 'qa-e2e' },
    }, 409, 'ACCOUNT_DEVICE_LIMIT');
  });

  let primaryUser;
  let primaryDevice;
  await step('admin user search details device search and audit', async () => {
    const users = await superAdmin.request(`/users?page=1&pageSize=20&search=${encodeURIComponent(state.QA_PRIMARY_PHONE)}`);
    primaryUser = users.items?.[0];
    if (!primaryUser) throw qaError('ADMIN_USER_SEARCH_EMPTY');
    const detail = await superAdmin.request(`/users/${primaryUser.id}`);
    primaryDevice = detail.devices?.find((device) => device.status === 'ACTIVE');
    if (!primaryDevice) throw qaError('ADMIN_DEVICE_MISSING');
    const devices = await superAdmin.request(`/devices?page=1&pageSize=20&search=${encodeURIComponent(detail.uid)}`);
    if (!devices.items?.some((device) => device.id === primaryDevice.id)) throw qaError('ADMIN_DEVICE_SEARCH_EMPTY');
    const audit = await superAdmin.request('/audit-logs?page=1&pageSize=20');
    if (!Array.isArray(audit.items)) throw qaError('ADMIN_AUDIT_INVALID');
    const keys = await superAdmin.request(`/license-keys?page=1&pageSize=20&batchId=${encodeURIComponent(firstGenerated.batchId)}`);
    if (!keys.items?.some((item) => item.id === firstKeyRecord.id)) throw qaError('ADMIN_KEY_QUERY_EMPTY');
    if (!firstGenerated.csv.startsWith('key,plan_code,expires_at')) throw qaError('CSV_EXPORT_INVALID');
  });

  await step('device suspend restore and mandatory reauthentication', async () => {
    await superAdmin.request(`/devices/${primaryDevice.id}/status`, { method: 'PATCH', body: { status: 'SUSPENDED', reason: 'qa-e2e' } });
    await expectApiError(`${clientBase}/license/heartbeat`, {
      method: 'POST', accessToken: primaryLogin.accessToken,
      body: { deviceFingerprint: state.QA_DEVICE_FINGERPRINT_A, clientVersion: 'qa-e2e' },
    }, 403, 'DEVICE_SUSPENDED');
    await superAdmin.request(`/devices/${primaryDevice.id}/status`, { method: 'PATCH', body: { status: 'ACTIVE', reason: 'qa-e2e' } });
    await expectApiError(`${clientBase}/license/heartbeat`, {
      method: 'POST', accessToken: primaryLogin.accessToken,
      body: { deviceFingerprint: state.QA_DEVICE_FINGERPRINT_A, clientVersion: 'qa-e2e' },
    }, 403, 'SESSION_INVALIDATED');
    primaryLogin = await login(clientBase, state.QA_PRIMARY_PHONE, state.QA_USER_PASSWORD, state.QA_DEVICE_FINGERPRINT_A);
    await heartbeat(clientBase, primaryLogin.accessToken, state.QA_DEVICE_FINGERPRINT_A);
  });

  await step('device unbind requires a new card and does not bypass backend state', async () => {
    await superAdmin.request(`/devices/${primaryDevice.id}/unbind`, { method: 'POST', body: { reason: 'qa-e2e' } });
    await expectAnyApiError(`${clientBase}/license/heartbeat`, {
      method: 'POST', accessToken: primaryLogin.accessToken,
      body: { deviceFingerprint: state.QA_DEVICE_FINGERPRINT_A, clientVersion: 'qa-e2e' },
    }, [401, 403]);
    primaryLogin = await login(clientBase, state.QA_PRIMARY_PHONE, state.QA_USER_PASSWORD, state.QA_DEVICE_FINGERPRINT_A);
    if (primaryLogin.device !== null || primaryLogin.entitlement?.status === 'ACTIVE') throw qaError('UNBIND_BYPASSED');
    const generated = await generateDayKey(superAdmin, dayPlan.id, state, 'QA_LICENSE_KEY_2');
    firstKeyRecord = generated.record;
    primaryLogin = await redeem(clientBase, primaryLogin.accessToken, state.QA_LICENSE_KEY_2, state.QA_DEVICE_FINGERPRINT_A);
  });

  await step('user suspend restore and mandatory reauthentication', async () => {
    await superAdmin.request(`/users/${primaryUser.id}/status`, { method: 'PATCH', body: { status: 'SUSPENDED', reason: 'qa-e2e' } });
    await expectApiError(`${clientBase}/license/heartbeat`, {
      method: 'POST', accessToken: primaryLogin.accessToken,
      body: { deviceFingerprint: state.QA_DEVICE_FINGERPRINT_A, clientVersion: 'qa-e2e' },
    }, 401, 'SESSION_INVALIDATED');
    await superAdmin.request(`/users/${primaryUser.id}/status`, { method: 'PATCH', body: { status: 'ACTIVE', reason: 'qa-e2e' } });
    primaryLogin = await login(clientBase, state.QA_PRIMARY_PHONE, state.QA_USER_PASSWORD, state.QA_DEVICE_FINGERPRINT_A);
    await heartbeat(clientBase, primaryLogin.accessToken, state.QA_DEVICE_FINGERPRINT_A);
  });

  await step('card revocation removes authorization', async () => {
    const keys = await superAdmin.request(`/license-keys?page=1&pageSize=20&batchId=${encodeURIComponent(firstKeyRecord.batchId)}`);
    const record = keys.items?.[0] ?? firstKeyRecord;
    await superAdmin.request(`/license-keys/${record.id}/status`, { method: 'PATCH', body: { status: 'REVOKED', reason: 'qa-e2e' } });
    await expectApiError(`${clientBase}/license/heartbeat`, {
      method: 'POST', accessToken: primaryLogin.accessToken,
      body: { deviceFingerprint: state.QA_DEVICE_FINGERPRINT_A, clientVersion: 'qa-e2e' },
    }, 403, 'ENTITLEMENT_INACTIVE');
  });

  let activeOfflineLease;
  await step('membership expiry and real offline lease window', async () => {
    await generateDayKey(superAdmin, dayPlan.id, state, 'QA_LICENSE_KEY_3');
    primaryLogin = await redeem(clientBase, primaryLogin.accessToken, state.QA_LICENSE_KEY_3, state.QA_DEVICE_FINGERPRINT_A);
    activeOfflineLease = await heartbeat(clientBase, primaryLogin.accessToken, state.QA_DEVICE_FINGERPRINT_A);
    const claims = parseJwsPayload(activeOfflineLease.offlineLicenseJws);
    if (Date.parse(claims.offlineUntil) <= Date.now()) throw qaError('OFFLINE_WINDOW_NOT_ACTIVE');
    runIsolatedSql(state, `UPDATE entitlements SET expires_at=DATE_SUB(NOW(), INTERVAL 1 MINUTE), status='ACTIVE', version=version+1 WHERE user_id='${sqlId(primaryUser.id)}'`);
    await expectApiError(`${clientBase}/license/heartbeat`, {
      method: 'POST', accessToken: primaryLogin.accessToken,
      body: { deviceFingerprint: state.QA_DEVICE_FINGERPRINT_A, clientVersion: 'qa-e2e' },
    }, 403, 'ENTITLEMENT_INACTIVE');
  });

  await step('refresh invalidation and logout', async () => {
    const oldSecondaryRefresh = secondaryLogin.refreshToken;
    await api(`${clientBase}/auth/refresh`, {
      method: 'POST', body: { refreshToken: oldSecondaryRefresh }, expectedStatus: 200,
    });
    await expectApiError(`${clientBase}/auth/refresh`, {
      method: 'POST', body: { refreshToken: oldSecondaryRefresh },
    }, 401, 'REFRESH_TOKEN_REUSE');
    await api(`${clientBase}/auth/logout`, {
      method: 'POST', accessToken: primaryLogin.accessToken,
      body: { refreshToken: primaryLogin.refreshToken }, expectedStatus: 200,
    });
    await expectApiError(`${clientBase}/auth/refresh`, {
      method: 'POST', body: { refreshToken: primaryLogin.refreshToken },
    }, 401, 'INVALID_REFRESH_TOKEN');
  });

  await step('operator auditor boundaries and admin session expiry', async () => {
    const operator = new AdminSession(adminBase, adminOrigin);
    await operator.login(state.QA_OPERATOR_USERNAME, state.QA_OPERATOR_PASSWORD);
    await operator.request('/users?page=1&pageSize=5');
    await expectAdminError(operator, '/audit-logs?page=1&pageSize=5', { method: 'GET' }, 403, 'ADMIN_FORBIDDEN');

    const auditor = new AdminSession(adminBase, adminOrigin);
    const auditorLogin = await auditor.login(state.QA_AUDITOR_USERNAME, state.QA_AUDITOR_PASSWORD);
    await auditor.request('/audit-logs?page=1&pageSize=5');
    await expectAdminError(auditor, '/plans', { method: 'POST', body: { code: 'NOPE', name: 'Nope', durationDays: 1 } }, 403, 'ADMIN_FORBIDDEN');
    runIsolatedSql(state, `UPDATE admin_sessions SET expires_at=DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE admin_id='${sqlId(auditorLogin.admin.id)}'`);
    await expectAdminError(auditor, '/auth/me', { method: 'GET' }, 401, 'ADMIN_SESSION_INVALID');
    await operator.request('/auth/logout', { method: 'POST' });
  });

  await step('network and service 500 feedback', async () => {
    await expectNetworkError('http://127.0.0.1:1/api/v1/auth/me');
    await expectApiError(`${clientBase}/auth/register`, {
      method: 'POST',
      headers: { 'x-logicnest-qa-fault': '500' },
      body: { phone: state.QA_PRIMARY_PHONE, password: state.QA_USER_PASSWORD, confirmPassword: state.QA_USER_PASSWORD },
    }, 500, 'INTERNAL_ERROR');
  });

  await step('prepare isolated desktop activation account', async () => {
    await api(`${clientBase}/auth/register`, {
      method: 'POST',
      body: {
        phone: state.QA_DESKTOP_PHONE,
        password: state.QA_DESKTOP_PASSWORD,
        confirmPassword: state.QA_DESKTOP_PASSWORD,
      },
      expectedStatus: 200,
    });
    const generated = await superAdmin.request('/license-keys/batches', {
      method: 'POST', body: { planId: dayPlan.id, count: 1 },
    });
    if (!generated.keys?.[0]) throw qaError('DESKTOP_CARD_GENERATION_FAILED');
    state.QA_DESKTOP_LICENSE_KEY = generated.keys[0];
    writeState(state);
  });

  await step('super admin logout', async () => {
    await superAdmin.request('/auth/logout', { method: 'POST' });
    await expectAdminError(superAdmin, '/auth/me', { method: 'GET' }, 401, 'ADMIN_SESSION_REQUIRED');
  });

  writeResult('passed');
  console.log(`[LicenseE2E] ${results.length} acceptance groups passed; sensitive QA values were not printed.`);
}

async function step(name, action) {
  currentStep = name;
  await action();
  results.push({ name, status: 'passed' });
  console.log(`[LicenseE2E] passed: ${name}`);
}

class AdminSession {
  constructor(baseUrl, origin) {
    this.baseUrl = baseUrl;
    this.origin = origin;
    this.cookies = new Map();
    this.csrf = '';
  }

  async login(username, password) {
    const response = await this.raw('/auth/login', { method: 'POST', body: { username, password }, skipCsrf: true });
    if (response.status !== 200) throw qaError('ADMIN_LOGIN_FAILED');
    this.csrf = response.body.csrfToken;
    return response.body;
  }

  async request(route, options = {}) {
    const response = await this.raw(route, options);
    if (response.status < 200 || response.status >= 300) throw qaError(`ADMIN_HTTP_${response.status}`);
    if (response.body?.csrfToken) this.csrf = response.body.csrfToken;
    return response.body;
  }

  async raw(route, options = {}) {
    const headers = { accept: 'application/json', ...(options.headers ?? {}) };
    const method = options.method ?? 'GET';
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    if (method !== 'GET' && method !== 'HEAD') {
      headers.origin = this.origin;
      if (!options.skipCsrf && this.csrf) headers['x-csrf-token'] = this.csrf;
    }
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${this.baseUrl}${route}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'manual',
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value); else this.cookies.delete(name);
    }
    return { status: response.status, body: await response.json().catch(() => null) };
  }
}

async function generateDayKey(admin, planId, state, stateKey) {
  let generated;
  await step(`generate day card ${stateKey.slice(-1) || '1'} and CSV`, async () => {
    generated = await admin.request('/license-keys/batches', { method: 'POST', body: { planId, count: 1 } });
    if (!generated.keys?.[0] || !generated.csv) throw qaError('CARD_GENERATION_FAILED');
    state[stateKey] = generated.keys[0];
    writeState(state);
  });
  const listed = await admin.request(`/license-keys?page=1&pageSize=20&batchId=${encodeURIComponent(generated.batch.id)}`);
  if (!listed.items?.[0]) throw qaError('GENERATED_CARD_NOT_QUERYABLE');
  return { record: listed.items[0], batchId: generated.batch.id, csv: generated.csv };
}

async function login(base, phone, password, fingerprint) {
  return api(`${base}/auth/login`, {
    method: 'POST',
    body: { phone, password, deviceFingerprint: fingerprint, clientVersion: 'qa-e2e' },
    expectedStatus: 200,
  });
}

async function redeem(base, accessToken, licenseKey, fingerprint) {
  return api(`${base}/license/redeem`, {
    method: 'POST', accessToken,
    body: { licenseKey, deviceFingerprint: fingerprint, clientVersion: 'qa-e2e' },
    expectedStatus: 200,
  });
}

async function heartbeat(base, accessToken, fingerprint) {
  return api(`${base}/license/heartbeat`, {
    method: 'POST', accessToken,
    body: { deviceFingerprint: fingerprint, clientVersion: 'qa-e2e' },
    expectedStatus: 200,
  });
}

async function api(url, options) {
  const headers = { accept: 'application/json', ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.accessToken) headers.authorization = `Bearer ${options.accessToken}`;
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json().catch(() => null);
  if (options.expectedStatus !== undefined && response.status !== options.expectedStatus) {
    throw qaError(`HTTP_${response.status}_${body?.error?.code ?? 'UNKNOWN'}`);
  }
  return body;
}

async function expectApiError(url, options, status, code) {
  const response = await rawApi(url, options);
  if (response.status !== status || response.body?.error?.code !== code) throw qaError(`EXPECTED_${status}_${code}`);
}

async function expectAnyApiError(url, options, statuses) {
  const response = await rawApi(url, options);
  if (!statuses.includes(response.status)) throw qaError('EXPECTED_API_REJECTION');
}

async function rawApi(url, options) {
  const headers = { accept: 'application/json', ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.accessToken) headers.authorization = `Bearer ${options.accessToken}`;
  const response = await fetch(url, {
    method: options.method ?? 'GET', headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function expectAdminError(session, route, options, status, code) {
  const response = await session.raw(route, options);
  if (response.status !== status || response.body?.error?.code !== code) throw qaError(`EXPECTED_ADMIN_${status}_${code}`);
}

async function expectStatus(url, status) {
  const response = await fetch(url);
  if (response.status !== status) throw qaError(`EXPECTED_HTTP_${status}`);
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw qaError(`FETCH_TEXT_${response.status}`);
  return response.text();
}

async function expectNetworkError(url) {
  try {
    await fetch(url);
  } catch {
    return;
  }
  throw qaError('NETWORK_ERROR_NOT_OBSERVED');
}

function runIsolatedSql(state, sql) {
  const result = spawnSync('docker', [
    'exec', '-e', `MYSQL_PWD=${state.MYSQL_PASSWORD}`,
    'logicnest-license-e2e-mysql-e2e-1',
    'mysql', '-u', state.MYSQL_USER, state.MYSQL_DATABASE, '--batch', '--skip-column-names', '-e', sql,
  ], { stdio: 'ignore', windowsHide: true });
  if (result.status !== 0) throw qaError('ISOLATED_SQL_FAILED');
}

function parseJwsPayload(compact) {
  if (typeof compact !== 'string') throw qaError('OFFLINE_JWS_MISSING');
  const part = compact.split('.')[1];
  if (!part) throw qaError('OFFLINE_JWS_INVALID');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function sqlId(value) {
  if (!/^[a-f0-9-]{36}$/i.test(value)) throw qaError('UNSAFE_SQL_ID');
  return value;
}

function readState() {
  const state = {};
  for (const line of fs.readFileSync(statePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator > 0) state[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return state;
}

function writeState(state) {
  const content = `${Object.entries(state).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
  fs.writeFileSync(statePath, content, { encoding: 'utf8', mode: 0o600 });
}

function writeResult(status) {
  fs.writeFileSync(resultPath, `${JSON.stringify({ status, executedAt: new Date().toISOString(), results }, null, 2)}\n`, {
    encoding: 'utf8', mode: 0o600,
  });
}

function randomPhone() {
  const suffix = String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0');
  return `+86139${suffix}`;
}

function assertIncludes(text, value) {
  if (!text.includes(value)) throw qaError('EXPECTED_BRAND_TEXT_MISSING');
}

function qaError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
