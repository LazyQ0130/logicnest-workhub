import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const readRepoFile = (file: string): string => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('LogicNest Windows installer security contract', () => {
  const nsis = readRepoFile('scripts/nsis-installer.nsh');
  const config = JSON.parse(readRepoFile('electron-builder.json')) as {
    appId?: string;
    productName?: string;
    win?: { requestedExecutionLevel?: string };
    nsis?: { deleteAppDataOnUninstall?: boolean };
  };

  test('uses the independent product identity without elevation', () => {
    expect(config.appId).toBe('com.logicnest.workhub');
    expect(config.productName).toBe('逻栖工枢');
    expect(config.win?.requestedExecutionLevel).toBe('asInvoker');
    expect(nsis).not.toMatch(/RequestExecutionLevel\s+admin/i);
  });

  test('does not weaken Defender or perform recursive cleanup', () => {
    expect(nsis).not.toMatch(/(?:Add|Set)-MpPreference/i);
    expect(nsis).not.toMatch(/\brm\s+-rf\b|\brmdir\s+\/s\b|\brd\s+\/s\b|Remove-Item\s+-Recurse/i);
  });

  test('preserves application data on uninstall', () => {
    expect(config.nsis?.deleteAppDataOnUninstall).toBe(false);
  });
});
