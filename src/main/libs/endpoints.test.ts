import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  app: { isPackaged: true },
}));

vi.mock('electron', () => electronMock);

import { getServerApiBaseUrl, getUpdateCheckUrl } from './endpoints';

describe('packaged service endpoints', () => {
  beforeEach(() => {
    delete process.env.LOGICNEST_LICENSE_API_URL;
    electronMock.app.isPackaged = true;
  });

  it('uses the production IP when a packaged build has no environment override', () => {
    expect(getServerApiBaseUrl()).toBe('https://43.251.225.201/api/v1');
    expect(getUpdateCheckUrl()).toContain('https://43.251.225.201/api/v1/');
  });

  it('keeps the loopback endpoint for development only', () => {
    electronMock.app.isPackaged = false;
    expect(getServerApiBaseUrl()).toBe('http://127.0.0.1:8787/api/v1');
  });
});
