import type { SettingsTabId } from '../../config/brandUi';

export const SettingsNavigationResult = {
  Blocked: 'blocked',
  Deferred: 'deferred',
  Continued: 'continued',
} as const;

export type SettingsNavigationResult =
  typeof SettingsNavigationResult[keyof typeof SettingsNavigationResult];

export const requestSettingsNavigation = ({
  activeTab,
  isBusy,
  guardPluginLeave,
  proceed,
}: {
  activeTab: SettingsTabId;
  isBusy: boolean;
  guardPluginLeave?: (proceed: () => void) => boolean;
  proceed: () => void;
}): SettingsNavigationResult => {
  if (isBusy) return SettingsNavigationResult.Blocked;
  if (activeTab === 'plugins' && guardPluginLeave?.(proceed)) {
    return SettingsNavigationResult.Deferred;
  }
  proceed();
  return SettingsNavigationResult.Continued;
};
