import { describe, expect, test } from 'vitest';

import {
  DEFAULT_DINGTALK_MULTI_INSTANCE_CONFIG,
  DEFAULT_IM_CONFIG,
  DEFAULT_IM_STATUS,
} from '../../types/im';
import reducer, { setConfig, setStatus } from './imSlice';

describe('imSlice active IPC payloads', () => {
  test('keeps compatibility defaults when config contains only active platforms', () => {
    const state = reducer(undefined, setConfig({
      dingtalk: DEFAULT_DINGTALK_MULTI_INSTANCE_CONFIG,
      settings: DEFAULT_IM_CONFIG.settings,
    }));

    expect(state.config.dingtalk).toEqual(DEFAULT_DINGTALK_MULTI_INSTANCE_CONFIG);
    expect(state.config.email).toEqual(DEFAULT_IM_CONFIG.email);
    expect(state.config.telegram).toEqual(DEFAULT_IM_CONFIG.telegram);
    expect(state.config.nim).toEqual(DEFAULT_IM_CONFIG.nim);
  });

  test('keeps compatibility defaults when status contains only active platforms', () => {
    const state = reducer(undefined, setStatus({
      dingtalk: DEFAULT_IM_STATUS.dingtalk,
      weixin: DEFAULT_IM_STATUS.weixin,
    }));

    expect(state.status.email).toEqual(DEFAULT_IM_STATUS.email);
    expect(state.status.discord).toEqual(DEFAULT_IM_STATUS.discord);
    expect(state.status.popo).toEqual(DEFAULT_IM_STATUS.popo);
  });
});
