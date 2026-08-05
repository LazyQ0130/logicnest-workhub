import { describe, expect, test } from 'vitest';

import {
  redactSensitiveText,
  sanitizeForLog,
  serializeForLog,
  stripAnsiControlCharacters,
} from './sanitizeForLog';

const SECRET_VALUE = 'prefix-visible-middle-visible-suffix';

describe('log redaction', () => {
  test.each([
    'API_KEY',
    'api-key',
    'TOKEN',
    'refresh_token',
    'SECRET',
    'password',
    'private_key',
  ])('removes the complete value for %s', (name) => {
    const result = redactSensitiveText(`${name}=${SECRET_VALUE}`);
    expect(result).toContain('[redacted]');
    expect(result).not.toContain('prefix-visible');
    expect(result).not.toContain('suffix');
    expect(result).not.toContain(SECRET_VALUE);
  });

  test('removes bearer tokens and complete private key bodies', () => {
    const privateKey = [
      '-----BEGIN PRIVATE KEY-----',
      SECRET_VALUE,
      '-----END PRIVATE KEY-----',
    ].join('\n');
    const result = redactSensitiveText(`Authorization: Bearer ${SECRET_VALUE}\n${privateKey}`);
    expect(result).not.toContain(SECRET_VALUE);
    expect(result).not.toContain('BEGIN PRIVATE KEY');
    expect(result).toContain('[redacted]');
  });

  test('redacts sensitive object fields without revealing length or fragments', () => {
    const result = sanitizeForLog({
      apiKey: SECRET_VALUE,
      nested: { password: SECRET_VALUE },
      safe: 'present',
    });
    expect(result).toEqual({
      apiKey: '[redacted]',
      nested: { password: '[redacted]' },
      safe: 'present',
    });
    expect(serializeForLog(result)).not.toContain(SECRET_VALUE);
  });

  test('removes CSI, OSC, and C1 ANSI control sequences before logging', () => {
    const input = '\u001b[31mred\u001b[0m \u001b]0;secret title\u0007plain \u009b32mgreen\u009b0m';

    expect(stripAnsiControlCharacters(input)).toBe('red plain green');
    expect(sanitizeForLog(input)).toBe('red plain green');
  });
});
