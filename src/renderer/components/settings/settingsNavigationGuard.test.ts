import { describe, expect, test, vi } from 'vitest';

import {
  requestSettingsNavigation,
  SettingsNavigationResult,
} from './settingsNavigationGuard';

describe('settings navigation guard', () => {
  test('blocks navigation while runtime data work is active', () => {
    const proceed = vi.fn();
    expect(requestSettingsNavigation({ activeTab: 'general', isBusy: true, proceed }))
      .toBe(SettingsNavigationResult.Blocked);
    expect(proceed).not.toHaveBeenCalled();
  });

  test('uses the extension pending-change guard for tab, home, and close destinations', () => {
    const destinations = ['tab', 'home', 'close'];
    destinations.forEach(() => {
      const proceed = vi.fn();
      const guardPluginLeave = vi.fn(() => true);
      expect(requestSettingsNavigation({
        activeTab: 'plugins',
        isBusy: false,
        guardPluginLeave,
        proceed,
      })).toBe(SettingsNavigationResult.Deferred);
      expect(guardPluginLeave).toHaveBeenCalledWith(proceed);
      expect(proceed).not.toHaveBeenCalled();
    });
  });

  test('continues immediately when no pending extension changes exist', () => {
    const proceed = vi.fn();
    expect(requestSettingsNavigation({
      activeTab: 'plugins',
      isBusy: false,
      guardPluginLeave: () => false,
      proceed,
    })).toBe(SettingsNavigationResult.Continued);
    expect(proceed).toHaveBeenCalledTimes(1);
  });
});
