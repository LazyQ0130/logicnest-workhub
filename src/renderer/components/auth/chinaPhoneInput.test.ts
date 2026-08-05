import { describe, expect, test } from 'vitest';

import {
  formatChinaMobileE164,
  normalizeChinaMobileInput,
} from './chinaPhoneInput';

describe('China mobile input', () => {
  test('keeps the national number while removing non-digit separators', () => {
    expect(normalizeChinaMobileInput('199 2512-7108')).toBe('19925127108');
  });

  test('accepts pasted +86 and 0086 numbers without showing the prefix in the input', () => {
    expect(normalizeChinaMobileInput('+86 19925127108')).toBe('19925127108');
    expect(normalizeChinaMobileInput('0086 19925127108')).toBe('19925127108');
  });

  test('limits the editable national number to eleven digits', () => {
    expect(normalizeChinaMobileInput('19925127108123')).toBe('19925127108');
  });

  test('adds the fixed +86 prefix only when building API credentials', () => {
    expect(formatChinaMobileE164('19925127108')).toBe('+8619925127108');
  });
});
