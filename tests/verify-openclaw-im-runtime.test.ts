import { describe, expect, test } from 'vitest';

const runtimeVerifier = require('../scripts/verify-openclaw-im-runtime.cjs') as {
  REQUIRED_IM_PLUGIN_IDS: readonly string[];
  getExpectedPlugins: (packageJson: unknown) => Array<{ id: string; version: string }>;
  normalizeVersion: (version: string) => string;
};

describe('OpenClaw IM runtime verifier', () => {
  test('requires only the five supported message platforms', () => {
    expect(runtimeVerifier.REQUIRED_IM_PLUGIN_IDS).toEqual([
      'dingtalk-connector',
      'openclaw-lark',
      'qqbot',
      'wecom-openclaw-plugin',
      'openclaw-weixin',
    ]);
  });

  test('fails when a required provider is missing from package declarations', () => {
    expect(() => runtimeVerifier.getExpectedPlugins({ openclaw: { plugins: [] } }))
      .toThrow('Required IM plugin is not declared');
  });

  test('normalizes tagged runtime versions', () => {
    expect(runtimeVerifier.normalizeVersion('v2026.6.1')).toBe('2026.6.1');
  });
});
