'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNTIME_ROOT = path.join(PROJECT_ROOT, 'vendor', 'openclaw-runtime', 'current');
const REQUIRED_IM_PLUGIN_IDS = Object.freeze([
  'dingtalk-connector',
  'openclaw-lark',
  'qqbot',
  'wecom-openclaw-plugin',
  'openclaw-weixin',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeVersion(version) {
  return String(version || '').replace(/^v/u, '');
}

function getExpectedPlugins(packageJson) {
  const declarations = packageJson.openclaw?.plugins || [];
  return REQUIRED_IM_PLUGIN_IDS.map((id) => {
    const plugin = declarations.find((entry) => entry.id === id);
    if (!plugin) {
      throw new Error(`Required IM plugin is not declared in package.json: ${id}`);
    }
    return { id, version: normalizeVersion(plugin.version) };
  });
}

function inspectRuntime(projectRoot = PROJECT_ROOT) {
  const packageJson = readJson(path.join(projectRoot, 'package.json'));
  const runtimeRoot = path.join(projectRoot, 'vendor', 'openclaw-runtime', 'current');
  const problems = [];
  const runtimePackagePath = path.join(runtimeRoot, 'package.json');

  if (!fs.existsSync(runtimePackagePath)) {
    problems.push({ code: 'runtime_missing', path: runtimeRoot });
    return { ok: false, runtimeRoot, problems, plugins: getExpectedPlugins(packageJson) };
  }

  const expectedRuntimeVersion = normalizeVersion(packageJson.openclaw?.version);
  const actualRuntimeVersion = normalizeVersion(readJson(runtimePackagePath).version);
  if (expectedRuntimeVersion !== actualRuntimeVersion) {
    problems.push({
      code: 'runtime_version_mismatch',
      expected: expectedRuntimeVersion,
      actual: actualRuntimeVersion,
    });
  }

  const plugins = getExpectedPlugins(packageJson);
  for (const plugin of plugins) {
    const pluginRoot = path.join(runtimeRoot, 'third-party-extensions', plugin.id);
    const manifestPath = path.join(pluginRoot, 'openclaw.plugin.json');
    const pluginPackagePath = path.join(pluginRoot, 'package.json');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(pluginPackagePath)) {
      problems.push({ code: 'plugin_missing', pluginId: plugin.id, path: pluginRoot });
      continue;
    }
    const manifest = readJson(manifestPath);
    if (manifest.id !== plugin.id) {
      problems.push({
        code: 'plugin_manifest_mismatch',
        pluginId: plugin.id,
        expected: plugin.id,
        actual: manifest.id,
      });
      continue;
    }
    const actualVersion = normalizeVersion(readJson(pluginPackagePath).version);
    if (plugin.version && plugin.version !== actualVersion) {
      problems.push({
        code: 'plugin_version_mismatch',
        pluginId: plugin.id,
        expected: plugin.version,
        actual: actualVersion,
      });
    }
  }

  return { ok: problems.length === 0, runtimeRoot, problems, plugins };
}

function runNodeScript(scriptName) {
  const result = spawnSync(process.execPath, [path.join(PROJECT_ROOT, 'scripts', scriptName)], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${scriptName} exited with code ${result.status ?? 'unknown'}`);
  }
}

function repairRuntime(inspection) {
  if (inspection.problems.some((problem) => problem.code.startsWith('runtime_'))) {
    runNodeScript('openclaw-runtime-host.cjs');
  } else {
    runNodeScript('ensure-openclaw-plugins.cjs');
  }
}

function formatProblems(problems) {
  return problems.map((problem) => {
    if (problem.code === 'runtime_missing') return `OpenClaw runtime missing: ${problem.path}`;
    if (problem.code === 'runtime_version_mismatch') {
      return `OpenClaw runtime version mismatch (expected ${problem.expected}, got ${problem.actual})`;
    }
    if (problem.code === 'plugin_missing') return `IM login provider missing: ${problem.pluginId}`;
    if (problem.code === 'plugin_manifest_mismatch') {
      return `IM plugin manifest mismatch: ${problem.pluginId} (expected ${problem.expected}, got ${problem.actual})`;
    }
    return `IM plugin version mismatch: ${problem.pluginId} (expected ${problem.expected}, got ${problem.actual})`;
  });
}

function main() {
  let inspection = inspectRuntime();
  if (!inspection.ok && process.argv.includes('--repair')) {
    console.log(`[openclaw-im-runtime] Repairing runtime: ${formatProblems(inspection.problems).join('; ')}`);
    repairRuntime(inspection);
    inspection = inspectRuntime();
  }

  if (!inspection.ok) {
    console.error(`[openclaw-im-runtime] ${formatProblems(inspection.problems).join('; ')}`);
    console.error('[openclaw-im-runtime] Run `npm run openclaw:runtime:host` and retry.');
    process.exitCode = 1;
    return;
  }

  console.log('[openclaw-im-runtime] OpenClaw runtime and required IM login providers are ready.');
}

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_IM_PLUGIN_IDS,
  formatProblems,
  getExpectedPlugins,
  inspectRuntime,
  normalizeVersion,
};
