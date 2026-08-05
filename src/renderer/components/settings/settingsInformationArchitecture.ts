import {
  SETTINGS_MODULES,
  type SettingsModuleDefinition,
  type SettingsTabDefinition,
  type SettingsTabId,
} from '../../config/brandUi';

export type SettingsEnterpriseUi = Record<string, 'hide' | 'disable' | 'readonly'>;

export type VisibleSettingsModule = Omit<SettingsModuleDefinition, 'tabs'> & {
  tabs: readonly SettingsTabDefinition[];
};

export type SettingsSearchResult = {
  module: VisibleSettingsModule;
  tab: SettingsTabDefinition;
};

export const getVisibleSettingsModules = ({
  isAuthenticated,
  enterpriseUi,
}: {
  isAuthenticated: boolean;
  enterpriseUi?: SettingsEnterpriseUi;
}): VisibleSettingsModule[] => (
  SETTINGS_MODULES
    .map((module) => ({
      ...module,
      tabs: module.tabs.filter((tab) => (
        (tab.id !== 'personalization' || isAuthenticated)
        && enterpriseUi?.[`settings.${tab.id}`] !== 'hide'
      )),
    }))
    .filter((module) => module.tabs.length > 0)
);

export const findSettingsModuleByTab = (
  modules: readonly VisibleSettingsModule[],
  tabId: SettingsTabId,
): VisibleSettingsModule | undefined => (
  modules.find((module) => module.tabs.some((tab) => tab.id === tabId))
);

export const isSettingsTabVisible = (
  modules: readonly VisibleSettingsModule[],
  tabId: SettingsTabId,
): boolean => Boolean(findSettingsModuleByTab(modules, tabId));

export const shouldOpenSettingsDetail = (
  initialTab: SettingsTabId | undefined,
  modules: readonly VisibleSettingsModule[],
): initialTab is SettingsTabId => Boolean(
  initialTab && isSettingsTabVisible(modules, initialTab),
);

export const searchSettings = (
  query: string,
  modules: readonly VisibleSettingsModule[],
  translate: (key: string) => string,
): SettingsSearchResult[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];

  return modules.flatMap((module) => module.tabs
    .filter((tab) => [
      translate(module.labelKey),
      translate(module.descriptionKey),
      translate(tab.labelKey),
      translate(tab.descriptionKey),
      translate(tab.keywordsKey),
    ].join(' ').toLocaleLowerCase().includes(normalizedQuery))
    .map((tab) => ({ module, tab })));
};
