import path from 'path';
import { expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getName: () => 'LobsterAI',
    getPath: () => process.cwd(),
    isPackaged: false,
  },
  session: { defaultSession: { resolveProxy: vi.fn() } },
}));

import { McpLaunchResolutionStatus, McpLaunchResolverKind } from './mcpLaunchResolution';
import {
  __mcpLaunchResolverTestUtils,
  isRecoverableNodeRuntimeResolutionError,
  isStaleInstallingResolution,
  McpLaunchResolverManager,
  packageRootFromInstallDir,
} from './mcpLaunchResolverManager';
import type { McpStore } from './mcpStore';

test('packageRootFromInstallDir preserves scoped npm package paths', () => {
  expect(packageRootFromInstallDir('C:\\managed', '@upstash/context7-mcp')).toBe(
    path.join('C:\\managed', 'node_modules', '@upstash', 'context7-mcp'),
  );
});

test('packageRootFromInstallDir resolves unscoped npm package paths', () => {
  expect(packageRootFromInstallDir('C:\\managed', 'tavily-mcp')).toBe(
    path.join('C:\\managed', 'node_modules', 'tavily-mcp'),
  );
});

test('isStaleInstallingResolution detects abandoned installs', () => {
  const now = 1_000_000;

  expect(isStaleInstallingResolution({
    serverId: 'server-1',
    resolverKind: McpLaunchResolverKind.Npx,
    sourceFingerprint: 'fingerprint',
    status: McpLaunchResolutionStatus.Installing,
    updatedAt: now - 631_000,
  }, now)).toBe(true);

  expect(isStaleInstallingResolution({
    serverId: 'server-1',
    resolverKind: McpLaunchResolverKind.Npx,
    sourceFingerprint: 'fingerprint',
    status: McpLaunchResolutionStatus.Installing,
    updatedAt: now - 629_000,
  }, now)).toBe(false);
});

test('resolveNpmCommand prefers bundled npm-cli.js through Electron runtime', () => {
  const npmCommand = __mcpLaunchResolverTestUtils.resolveNpmCommand();
  const expectedCache = path.join(process.cwd(), 'npm-cache');

  expect(npmCommand.command).toBe(process.execPath);
  expect(npmCommand.baseArgs[0]).toContain(path.join('node_modules', 'npm', 'bin', 'npm-cli.js'));
  expect(npmCommand.env.ELECTRON_RUN_AS_NODE).toBe('1');
  expect(npmCommand.env.npm_config_cache).toBe(expectedCache);
  expect(npmCommand.env.NPM_CONFIG_CACHE).toBe(expectedCache);
  expect(npmCommand.shell).toBe(false);
});

test('isRecoverableNodeRuntimeResolutionError detects Windows node shim ENOENT', () => {
  expect(isRecoverableNodeRuntimeResolutionError({
    serverId: 'server-1',
    resolverKind: McpLaunchResolverKind.Npx,
    sourceFingerprint: 'fingerprint',
    status: McpLaunchResolutionStatus.Failed,
    error: 'spawn C:\\Users\\demo\\AppData\\Roaming\\LobsterAI\\cowork\\bin\\node ENOENT',
    updatedAt: Date.now(),
  })).toBe(true);

  expect(isRecoverableNodeRuntimeResolutionError({
    serverId: 'server-1',
    resolverKind: McpLaunchResolverKind.Npx,
    sourceFingerprint: 'fingerprint',
    status: McpLaunchResolutionStatus.Failed,
    error: 'npm view exited with code 1',
    updatedAt: Date.now(),
  })).toBe(false);
});

test('terminateProcessTree kills the full Windows process tree', () => {
  const kill = vi.fn();
  const runSync = vi.fn().mockReturnValue({ status: 0 });

  __mcpLaunchResolverTestUtils.terminateProcessTree(
    { pid: 1234, kill },
    'win32',
    runSync,
  );

  expect(runSync).toHaveBeenCalledWith('taskkill', ['/pid', '1234', '/T', '/F']);
  expect(kill).not.toHaveBeenCalled();
});

test('terminateProcessTree falls back to killing the child when taskkill fails', () => {
  const kill = vi.fn();
  const runSync = vi.fn().mockReturnValue({ status: 1 });

  __mcpLaunchResolverTestUtils.terminateProcessTree(
    { pid: 1234, kill },
    'win32',
    runSync,
  );

  expect(kill).toHaveBeenCalledOnce();
});

test('retry rejects when the persisted launch resolution failed', async () => {
  const failure = {
    serverId: 'server-1',
    resolverKind: McpLaunchResolverKind.Npx,
    sourceFingerprint: 'fingerprint',
    status: McpLaunchResolutionStatus.Failed,
    error: 'npm install failed',
    updatedAt: Date.now(),
  };
  const store = {
    getLaunchResolution: vi.fn().mockReturnValue(failure),
  } as unknown as McpStore;
  const manager = new McpLaunchResolverManager(
    store,
    vi.fn(),
    vi.fn(),
  );
  const internal = manager as unknown as { inFlight: Map<string, Promise<void>> };
  internal.inFlight.set('server-1', Promise.resolve());

  await expect(manager.retry('server-1')).rejects.toThrow('npm install failed');
});
