const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const statePath = path.join(repositoryRoot, 'services', 'license-server', '.dev-secrets', 'e2e-state.env');
const resultPath = path.join(repositoryRoot, 'services', 'license-server', '.dev-secrets', 'desktop-e2e-result.json');
const rendererPort = 15175;
const debuggingPort = 19222;
const authorizedCycles = 10;
const electronChildren = new Set();

main().catch((error) => {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED_ERROR';
  writeResult({ status: 'failed', code });
  console.error(`[DesktopE2E] failed (${code})`);
  process.exitCode = 1;
});

async function main() {
  if (!fs.existsSync(statePath)) throw codedError('QA_STATE_MISSING');
  const state = readState();
  for (const key of [
    'QA_DESKTOP_PHONE',
    'QA_DESKTOP_PASSWORD',
    'QA_DESKTOP_LICENSE_KEY',
    'QA_DESKTOP_DEVICE_FINGERPRINT',
    'QA_USER_DATA_DIR_A',
    'LICENSE_JWS_PUBLIC_KEY_B64',
  ]) {
    if (!state[key]) throw codedError(`QA_STATE_${key}_MISSING`);
  }
  fs.mkdirSync(state.QA_USER_DATA_DIR_A, { recursive: true });
  await waitForPortClosed(rendererPort, 10_000);
  await waitForPortClosed(debuggingPort, 10_000);

  const vite = spawn(process.execPath, [
    path.join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview',
    '--host', '127.0.0.1',
    '--port', String(rendererPort),
    '--strictPort',
  ], { cwd: repositoryRoot, stdio: 'ignore', windowsHide: true });

  const baselineLogs = logSnapshot(state.QA_USER_DATA_DIR_A);
  const cycleResults = [];
  let activeCdp = null;
  try {
    await waitForHttp(`http://127.0.0.1:${rendererPort}`, 60_000);
    console.log('[DesktopE2E] production renderer ready');
    await launchElectron(state);
    let cdp = await connectToPage(debuggingPort, 90_000);
    activeCdp = cdp;
    await waitForCondition(cdp, `document.querySelector('input[autocomplete="tel-national"]') !== null`, 60_000);
    console.log('[DesktopE2E] signed-out gate ready');
    await fillAndSubmitLogin(cdp, state);
    await waitForCondition(cdp, `document.querySelector('input[placeholder^="LQGX-"]') !== null`, 60_000);
    console.log('[DesktopE2E] activation-only shell ready');
    await fillAndSubmitActivation(cdp, state);
    await cdp.waitForClose(60_000);
    await cdp.close();
    activeCdp = null;

    cdp = await connectToPage(debuggingPort, 120_000);
    activeCdp = cdp;
    await waitForAuthorizedWorkspace(cdp, 120_000);
    cycleResults.push(await inspectAuthorizedState(cdp, 'activation-relaunch'));
    console.log('[DesktopE2E] passed real activation and automatic relaunch');
    await closeApp(cdp);
    activeCdp = null;

    for (let cycle = 1; cycle <= authorizedCycles; cycle += 1) {
      await launchElectron(state);
      const cycleCdp = await connectToPage(debuggingPort, 90_000);
      activeCdp = cycleCdp;
      await waitForAuthorizedWorkspace(cycleCdp, 120_000);
      cycleResults.push(await inspectAuthorizedState(cycleCdp, `authorized-cycle-${cycle}`));
      await closeApp(cycleCdp);
      activeCdp = null;
      console.log(`[DesktopE2E] passed authorized startup/close cycle ${cycle}/${authorizedCycles}`);
    }
  } finally {
    if (activeCdp) {
      await activeCdp.evaluate('window.electron.window.close(); true').catch(() => undefined);
      await activeCdp.close().catch(() => undefined);
    } else {
      const cleanupCdp = await connectToPage(debuggingPort, 2_000).catch(() => null);
      if (cleanupCdp) {
        await cleanupCdp.evaluate('window.electron.window.close(); true').catch(() => undefined);
        await cleanupCdp.close().catch(() => undefined);
      }
    }
    if (!vite.killed) vite.kill();
    for (const child of electronChildren) {
      if (child.exitCode === null && !child.killed) child.kill();
    }
    await new Promise((resolve) => {
      if (vite.exitCode !== null) resolve();
      else {
        vite.once('close', resolve);
        setTimeout(resolve, 5_000);
      }
    });
  }

  const diagnostics = analyzeLogs(state.QA_USER_DATA_DIR_A, baselineLogs);
  if (diagnostics.epipeCount !== 0) throw codedError('EPIPE_DETECTED');
  if (diagnostics.rendererGoneCount !== 0) throw codedError('RENDERER_GONE_DETECTED');
  if (diagnostics.requireFallbackCount !== 0) throw codedError('OPENCLAW_REQUIRE_FALLBACK_DETECTED');
  if (diagnostics.ansiCount !== 0) throw codedError('ANSI_CONTROL_SEQUENCE_DETECTED');
  if (diagnostics.maximumLogBytes > 10 * 1024 * 1024) throw codedError('LOG_SIZE_LIMIT_EXCEEDED');
  if (cycleResults.some((result) => result.phase !== 'authorized')) throw codedError('AUTHORIZED_STATE_NOT_PERSISTED');
  const themeClasses = new Set(cycleResults.map((result) => result.themeClass));
  if (themeClasses.size !== 1) throw codedError('THEME_NOT_PERSISTED');

  writeResult({ status: 'passed', cycleResults, diagnostics });
  console.log(`[DesktopE2E] ${authorizedCycles} authorized startup/close cycles passed; no renderer crash or EPIPE was observed.`);
  console.log(`[DesktopE2E] maximum isolated main log size: ${diagnostics.maximumLogBytes} bytes.`);
}

async function launchElectron(state) {
  await waitForPortClosed(debuggingPort, 30_000);
  const publicKeyBody = Buffer.from(state.LICENSE_JWS_PUBLIC_KEY_B64, 'base64').toString('base64').match(/.{1,64}/g)?.join('\n');
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    ELECTRON_START_URL: `http://127.0.0.1:${rendererPort}`,
    LOGICNEST_QA_E2E: '1',
    LOGICNEST_QA_USER_DATA_DIR: state.QA_USER_DATA_DIR_A,
    LOGICNEST_QA_DEVICE_FINGERPRINT: state.QA_DESKTOP_DEVICE_FINGERPRINT,
    LOGICNEST_LICENSE_API_URL: `http://127.0.0.1:${state.LICENSE_SERVER_PORT}/api/v1`,
    LOGICNEST_LICENSE_PUBLIC_KEY_PEM: `-----BEGIN PUBLIC KEY-----\n${publicKeyBody}\n-----END PUBLIC KEY-----`,
    LOGICNEST_HEARTBEAT_INTERVAL_SECONDS: '30',
    LOGICNEST_OFFLINE_GRACE_HOURS: '1',
  };
  const executable = path.join(repositoryRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  const child = spawn(executable, [`--remote-debugging-port=${debuggingPort}`, repositoryRoot], {
    cwd: repositoryRoot,
    env,
    detached: false,
    stdio: 'ignore',
    windowsHide: true,
  });
  electronChildren.add(child);
  child.once('close', () => electronChildren.delete(child));
  return child;
}

async function fillAndSubmitLogin(cdp, state) {
  const nationalPhone = state.QA_DESKTOP_PHONE.replace(/^\+86/, '');
  const expression = `(() => {
    const setValue = (element, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setValue(document.querySelector('input[autocomplete="tel-national"]'), ${JSON.stringify(nationalPhone)});
    setValue(document.querySelector('input[autocomplete="current-password"]'), ${JSON.stringify(state.QA_DESKTOP_PASSWORD)});
    document.querySelector('form').requestSubmit();
    return true;
  })()`;
  await cdp.evaluate(expression);
}

async function fillAndSubmitActivation(cdp, state) {
  const expression = `(() => {
    const input = document.querySelector('input[placeholder^="LQGX-"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(state.QA_DESKTOP_LICENSE_KEY)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.closest('form').requestSubmit();
    return true;
  })()`;
  cdp.fireAndForget('Runtime.evaluate', {
    expression,
    awaitPromise: false,
    returnByValue: false,
  });
  await delay(100);
}

async function waitForAuthorizedWorkspace(cdp, timeoutMs) {
  await waitForCondition(cdp, `window.electron?.license?.getState !== undefined`, timeoutMs);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await cdp.evaluate(`(async () => {
      const state = await window.electron.license.getState();
      return {
        phase: state.phase,
        hasWorkspaceShell: Boolean(document.querySelector('aside'))
          && !document.querySelector('input[placeholder^="LQGX-"]'),
      };
    })()`);
    if (result?.phase === 'authorized' && result.hasWorkspaceShell) return;
    await delay(500);
  }
  throw codedError('AUTHORIZED_WORKSPACE_TIMEOUT');
}

async function inspectAuthorizedState(cdp, name) {
  const result = await cdp.evaluate(`(async () => {
    const state = await window.electron.license.getState();
    return {
      phase: state.phase,
      hasAccount: Boolean(state.user),
      hasMembership: state.membership?.status === 'active',
      themeClass: document.documentElement.className,
      hasWorkspace: Boolean(document.querySelector('aside'))
        && !document.querySelector('input[placeholder^="LQGX-"]'),
    };
  })()`);
  if (!result?.hasAccount || !result.hasMembership || !result.hasWorkspace) throw codedError('DESKTOP_STATE_INCOMPLETE');
  return { name, ...result };
}

async function closeApp(cdp) {
  cdp.fireAndForget('Runtime.evaluate', {
    expression: 'window.electron.window.close(); true',
    returnByValue: true,
  });
  await delay(100);
  await cdp.close();
  await waitForPortClosed(debuggingPort, 60_000);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    this.closedPromise = new Promise((resolve) => {
      this.resolveClosed = resolve;
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(codedError('CDP_PROTOCOL_ERROR'));
      else pending.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      this.closed = true;
      this.resolveClosed();
      for (const pending of this.pending.values()) pending.reject(codedError('CDP_CLOSED'));
      this.pending.clear();
    });
  }

  async call(method, params = {}) {
    const id = this.nextId++;
    let timeout;
    const response = new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(codedError('CDP_CALL_TIMEOUT'));
      }, 15_000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
      });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  fireAndForget(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
  }

  async waitForClose(timeoutMs) {
    if (this.closed) return;
    await Promise.race([
      this.closedPromise,
      new Promise((_, reject) => setTimeout(() => reject(codedError('CDP_CLOSE_TIMEOUT')), timeoutMs)),
    ]);
  }

  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) throw codedError('CDP_EVALUATION_FAILED');
    return response.result?.value;
  }

  async close() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
  }
}

async function connectToPage(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
      if (target) {
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true });
          socket.addEventListener('error', reject, { once: true });
        });
        return new CdpClient(socket);
      }
    } catch {
      // Electron has not opened the DevTools endpoint yet.
    }
    await delay(250);
  }
  throw codedError('CDP_CONNECT_TIMEOUT');
}

async function waitForCondition(cdp, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await delay(250);
  }
  throw codedError('DOM_CONDITION_TIMEOUT');
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Renderer server is still starting.
    }
    await delay(250);
  }
  throw codedError('RENDERER_SERVER_TIMEOUT');
}

async function waitForPortClosed(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`);
    } catch {
      return;
    }
    await delay(250);
  }
  throw codedError('DEBUGGING_PORT_STILL_OPEN');
}

function logSnapshot(userDataPath) {
  const directory = path.join(userDataPath, 'logs');
  if (!fs.existsSync(directory)) return {};
  return Object.fromEntries(fs.readdirSync(directory).filter((name) => name.endsWith('.log')).map((name) => {
    const target = path.join(directory, name);
    return [target, fs.statSync(target).size];
  }));
}

function analyzeLogs(userDataPath, baseline) {
  const directory = path.join(userDataPath, 'logs');
  const files = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => name.endsWith('.log')).map((name) => path.join(directory, name))
    : [];
  let combined = '';
  let maximumLogBytes = 0;
  for (const file of files) {
    const size = fs.statSync(file).size;
    maximumLogBytes = Math.max(maximumLogBytes, size);
    const offset = Math.min(baseline[file] ?? 0, size);
    const descriptor = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(size - offset);
    fs.readSync(descriptor, buffer, 0, buffer.length, offset);
    fs.closeSync(descriptor);
    combined += buffer.toString('utf8');
  }
  return {
    maximumLogBytes,
    epipeCount: count(combined, /\bEPIPE\b/g),
    rendererGoneCount: count(combined, /\[RendererCrash\]/g),
    requireFallbackCount: count(combined, /require\(.+entry\.js|require.*failed.*import/gi),
    missingPluginWarnings: count(combined, /plugin not installed:/gi),
    ansiCount: count(combined, /\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g),
  };
}

function count(text, pattern) {
  return text.match(pattern)?.length ?? 0;
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

function writeResult(value) {
  fs.writeFileSync(resultPath, `${JSON.stringify({ ...value, executedAt: new Date().toISOString() }, null, 2)}\n`, {
    encoding: 'utf8', mode: 0o600,
  });
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
