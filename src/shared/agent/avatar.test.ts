import { describe, expect, test } from 'vitest';

import {
  AgentAvatarIconFormat,
  AgentAvatarIconSeparator,
  AgentAvatarSvg,
  DefaultAgentAvatar,
  DefaultAgentAvatarIcon,
  encodeAgentAvatarIcon,
  isDesignedAgentAvatarIcon,
  LegacyAgentAvatarSvg,
  normalizeAgentAvatarIcon,
  parseAgentAvatarIcon,
} from './avatar';

describe('agent avatar icon encoding', () => {
  test('round-trips svg avatar selections', () => {
    const value = encodeAgentAvatarIcon({
      svg: AgentAvatarSvg.Code,
    });

    expect(parseAgentAvatarIcon(value)).toEqual({
      svg: AgentAvatarSvg.Code,
    });
  });

  test('exposes the default svg avatar icon', () => {
    expect(parseAgentAvatarIcon(DefaultAgentAvatarIcon)).toEqual(DefaultAgentAvatar);
  });

  test('maps the legacy lobster avatar to the owl', () => {
    const legacyValue = [
      AgentAvatarIconFormat.Svg,
      LegacyAgentAvatarSvg.Lobster,
    ].join(AgentAvatarIconSeparator.Value);

    expect(parseAgentAvatarIcon(legacyValue)).toEqual({ svg: AgentAvatarSvg.Owl });
    expect(normalizeAgentAvatarIcon(legacyValue)).toBe(DefaultAgentAvatarIcon);
  });

  test('leaves legacy emoji icons untouched', () => {
    expect(parseAgentAvatarIcon('🤖')).toBeNull();
    expect(isDesignedAgentAvatarIcon('🤖')).toBe(false);
  });

  test('normalizes empty and legacy icons to the default svg avatar', () => {
    expect(normalizeAgentAvatarIcon('')).toBe(DefaultAgentAvatarIcon);
    expect(normalizeAgentAvatarIcon('legacy-icon')).toBe(DefaultAgentAvatarIcon);
    expect(normalizeAgentAvatarIcon('agent-avatar:blue:code')).toBe(DefaultAgentAvatarIcon);
    expect(normalizeAgentAvatarIcon('agent-avatar:blue:missing')).toBe(DefaultAgentAvatarIcon);
  });

  test('preserves valid svg avatars when normalizing', () => {
    const value = encodeAgentAvatarIcon({
      svg: AgentAvatarSvg.Brain,
    });

    expect(normalizeAgentAvatarIcon(` ${value} `)).toBe(value);
  });

  test('rejects malformed avatar values', () => {
    expect(parseAgentAvatarIcon('agent-avatar:blue:code')).toBeNull();
    expect(parseAgentAvatarIcon('agent-avatar:blue:missing')).toBeNull();
    expect(parseAgentAvatarIcon('agent-avatar:missing:code')).toBeNull();
    expect(parseAgentAvatarIcon('agent-avatar-svg:missing')).toBeNull();
  });
});
