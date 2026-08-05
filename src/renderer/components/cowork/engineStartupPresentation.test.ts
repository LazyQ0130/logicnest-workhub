import { describe, expect, test } from 'vitest';

import {
  EngineStartupPresentation,
  resolveEngineStartupPresentation,
} from './engineStartupPresentation';

describe('resolveEngineStartupPresentation', () => {
  test('keeps the cold-start screen during renderer bootstrap', () => {
    expect(resolveEngineStartupPresentation({
      bootstrapping: true,
      phase: 'running',
      hasReachedRunning: true,
    })).toBe(EngineStartupPresentation.ColdStart);
  });

  test('uses the cold-start screen before the engine has run', () => {
    expect(resolveEngineStartupPresentation({
      bootstrapping: false,
      phase: 'starting',
      hasReachedRunning: false,
    })).toBe(EngineStartupPresentation.ColdStart);
  });

  test('uses a non-blocking reconnect notice for a mid-session restart', () => {
    expect(resolveEngineStartupPresentation({
      bootstrapping: false,
      phase: 'starting',
      hasReachedRunning: true,
    })).toBe(EngineStartupPresentation.Reconnecting);
  });

  test('hides startup presentation when the engine is not starting', () => {
    expect(resolveEngineStartupPresentation({
      bootstrapping: false,
      phase: 'running',
      hasReachedRunning: true,
    })).toBe(EngineStartupPresentation.Hidden);
  });
});
