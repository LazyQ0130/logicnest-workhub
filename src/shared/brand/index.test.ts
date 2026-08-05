import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { APP_NAME, BRAND } from './index';

describe('brand paths preserve Unicode', () => {
  test('keeps the configured Windows user data directory intact', () => {
    expect(APP_NAME).toBe('逻栖工枢');
    expect(BRAND.userDataDirectory).toBe('逻栖工枢');
    const userDataPath = path.win32.join('C:\\Users\\测试用户\\AppData\\Roaming', BRAND.userDataDirectory);
    expect(path.win32.basename(userDataPath)).toBe('逻栖工枢');
    expect(Buffer.from(userDataPath, 'utf8').toString('utf8')).toBe(userDataPath);
  });
});
