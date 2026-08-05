import { describe, expect, test } from 'vitest';

import { PlatformRegistry } from './constants';

describe('active message platforms', () => {
  test('exposes only the five supported platforms', () => {
    expect(PlatformRegistry.platforms).toEqual([
      'weixin',
      'dingtalk',
      'feishu',
      'wecom',
      'qq',
    ]);
  });

  test.each([
    'nim',
    'netease-bee',
    'moltbot-popo',
    'telegram',
    'discord',
    'email',
  ])('recognizes %s only as a retired channel', (channel) => {
    expect(PlatformRegistry.isIMChannel(channel)).toBe(false);
    expect(PlatformRegistry.isRetiredIMChannel(channel)).toBe(true);
    expect(PlatformRegistry.platformOfChannel(channel)).toBeUndefined();
  });
});
