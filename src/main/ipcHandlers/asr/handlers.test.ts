import { describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

import { buildAsrSessionUrl } from './handlers';

describe('buildAsrSessionUrl', () => {
  test('removes the client API version prefix before appending the ASR route', () => {
    expect(buildAsrSessionUrl('http://127.0.0.1:8787/api/v1')).toBe(
      'http://127.0.0.1:8787/api/asr/realtime/sessions',
    );
  });

  test('keeps a server root URL intact', () => {
    expect(buildAsrSessionUrl('https://voice.example.test/')).toBe(
      'https://voice.example.test/api/asr/realtime/sessions',
    );
  });
});
