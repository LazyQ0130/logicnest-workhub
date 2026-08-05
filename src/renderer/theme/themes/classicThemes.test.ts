import { describe, expect, test } from 'vitest';

import { classicDark } from './classic-dark';
import { classicLight } from './classic-light';

describe('default neutral themes', () => {
  test('uses a black, white and warm-gray light palette', () => {
    expect(classicLight.tokens.primary).toBe('#18181B');
    expect(classicLight.tokens.background).toBe('#F7F7F5');
    expect(classicLight.tokens['chat-user']).toBe('#ECECEA');
  });

  test('uses a charcoal and neutral-gray dark palette', () => {
    expect(classicDark.tokens.primary).toBe('#737373');
    expect(classicDark.tokens.background).toBe('#171717');
    expect(classicDark.tokens.surface).toBe('#202020');
  });
});
