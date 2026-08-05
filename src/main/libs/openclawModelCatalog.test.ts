import { describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '',
    isPackaged: false,
  },
}));

import {
  invokeSynchronousOpenClawCatalogBuilder,
  normalizeOpenClawCatalogBuilderEnv,
} from './openclawModelCatalog';

describe('OpenClaw catalog builder compatibility', () => {
  test('normalizes external values to strings before passing them to builders', () => {
    expect(normalizeOpenClawCatalogBuilderEnv({
      STRING_VALUE: 'ready',
      NUMBER_VALUE: 42,
      BOOLEAN_VALUE: false,
      MISSING_VALUE: undefined,
    })).toEqual({
      STRING_VALUE: 'ready',
      NUMBER_VALUE: '42',
      BOOLEAN_VALUE: 'false',
    });
  });

  test('does not invoke async discovery builders from the synchronous catalog index', () => {
    let invocationCount = 0;
    const discoveryBuilder = async (discoveryApiKey: unknown) => {
      invocationCount += 1;
      return { models: [String(discoveryApiKey).trim()] };
    };

    expect(invokeSynchronousOpenClawCatalogBuilder(discoveryBuilder, {})).toBeUndefined();
    expect(invocationCount).toBe(0);
  });

  test('supports static builders that require a normalized environment object', () => {
    const builder = (env?: Record<string, string>) => {
      if (!env) throw new TypeError('environment is required');
      return { models: [{ id: env.MODEL_ID, maxTokens: 1024 }] };
    };

    expect(invokeSynchronousOpenClawCatalogBuilder(builder, { MODEL_ID: 7 })).toEqual({
      models: [{ id: '7', maxTokens: 1024 }],
    });
  });
});
