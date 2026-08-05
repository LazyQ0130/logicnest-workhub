import { describe, expect, test } from 'vitest';

import {
  isBrokenPipeError,
  ProcessConsoleStream,
  ProcessStreamHealth,
} from './processStreamSafety';

describe('process stream EPIPE safety', () => {
  test('disables only the failed stream and reports it once', () => {
    const health = new ProcessStreamHealth();
    const error = Object.assign(new Error('broken pipe'), { code: 'EPIPE' });

    expect(isBrokenPipeError(error)).toBe(true);
    expect(health.markError(ProcessConsoleStream.Stdout, error)).toBe(true);
    expect(health.markError(ProcessConsoleStream.Stdout, error)).toBe(false);
    expect(health.canWrite(ProcessConsoleStream.Stdout)).toBe(false);
    expect(health.canWrite(ProcessConsoleStream.Stderr)).toBe(true);
  });

  test('does not disable a stream for unrelated errors', () => {
    const health = new ProcessStreamHealth();
    const error = Object.assign(new Error('reset'), { code: 'ECONNRESET' });

    expect(health.markError(ProcessConsoleStream.Stderr, error)).toBe(false);
    expect(health.canWrite(ProcessConsoleStream.Stderr)).toBe(true);
  });
});
