// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';

const storedValues = new Map<string, unknown>();

vi.mock('./store', () => ({
  localStore: {
    getItem: vi.fn(async (key: string) => storedValues.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: unknown) => {
      storedValues.set(key, value);
    }),
  },
}));

import {
  calculateCenteredCrop,
  createDefaultUserPersonalization,
  normalizeUserPersonalization,
  PersonalizationAvatarKind,
  presetAvatarOptions,
  userPersonalizationService,
} from './userPersonalization';

describe('user personalization', () => {
  beforeEach(() => {
    storedValues.clear();
  });

  test('loads defaults and keeps profiles isolated by license user ID', async () => {
    expect(await userPersonalizationService.get('user-a')).toEqual(
      createDefaultUserPersonalization(),
    );

    await userPersonalizationService.set('user-a', {
      version: 1,
      displayName: ' Olivia ',
      signature: ' Building useful things ',
      avatar: { kind: PersonalizationAvatarKind.Preset, presetId: '7' },
    });

    expect(await userPersonalizationService.get('user-a')).toMatchObject({
      displayName: 'Olivia',
      signature: 'Building useful things',
      avatar: { kind: PersonalizationAvatarKind.Preset, presetId: '7' },
    });
    expect(await userPersonalizationService.get('user-b')).toEqual(
      createDefaultUserPersonalization(),
    );
  });

  test('normalizes malformed fields and rejects unknown avatars', () => {
    expect(normalizeUserPersonalization({
      displayName: 123,
      signature: null,
      avatar: { kind: PersonalizationAvatarKind.Preset, presetId: '99' },
    })).toEqual(createDefaultUserPersonalization());
  });

  test('exposes all 35 bundled avatars in numeric order', () => {
    expect(presetAvatarOptions).toHaveLength(35);
    expect(presetAvatarOptions.map((option) => option.id)).toEqual(
      Array.from({ length: 35 }, (_, index) => String(index + 1)),
    );
  });

  test('calculates a centered square crop for portrait and landscape images', () => {
    expect(calculateCenteredCrop(1200, 800)).toEqual({ sx: 200, sy: 0, size: 800 });
    expect(calculateCenteredCrop(600, 1000)).toEqual({ sx: 0, sy: 200, size: 600 });
    expect(() => calculateCenteredCrop(0, 100)).toThrow('Invalid image dimensions');
  });
});
