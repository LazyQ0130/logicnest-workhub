import { describe, expect, it } from 'vitest';

import { compareVersions, isComparableVersion, isSkillUpdateAvailable } from '../src/renderer/services/skill';

describe('skill version comparison', () => {
  it('does not treat a missing legacy version as 0.0.0', () => {
    expect(isComparableVersion(undefined)).toBe(false);
    expect(isComparableVersion('')).toBe(false);
    expect(isComparableVersion('legacy')).toBe(false);
  });

  it('accepts catalog semver values', () => {
    expect(isComparableVersion('1.0.0')).toBe(true);
    expect(isComparableVersion('1.1.0')).toBe(true);
    expect(isComparableVersion('2.0.0-beta.1')).toBe(true);
  });

  it('compares valid versions normally', () => {
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
  });

  it('only reports an update when both versions are known', () => {
    expect(isSkillUpdateAvailable('1.0.0', undefined)).toBe(false);
    expect(isSkillUpdateAvailable('1.0.0', 'legacy')).toBe(false);
    expect(isSkillUpdateAvailable('1.0.0', '1.0.0')).toBe(false);
    expect(isSkillUpdateAvailable('1.1.0', '1.0.0')).toBe(true);
  });
});
