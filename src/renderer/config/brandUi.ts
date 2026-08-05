export const SidebarDestination = {
  WorkHub: 'workHub',
  MeetingRooms: 'meetingRooms',
  TaskHistory: 'taskHistory',
  Automations: 'automations',
  Assistants: 'assistants',
  Capabilities: 'capabilities',
  Solutions: 'solutions',
  Connections: 'connections',
} as const;

export type SidebarDestination =
  typeof SidebarDestination[keyof typeof SidebarDestination];

export const SIDEBAR_NAV_GROUPS = [
  {
    id: 'work',
    labelKey: 'brandNavGroupWork',
    items: [
      { destination: SidebarDestination.WorkHub, labelKey: 'workHub' },
      { destination: SidebarDestination.MeetingRooms, labelKey: 'meetingRooms' },
      { destination: SidebarDestination.Automations, labelKey: 'scheduledTasks' },
    ],
  },
  {
    id: 'resources',
    labelKey: 'brandNavGroupResources',
    items: [
      { destination: SidebarDestination.Capabilities, labelKey: 'skills' },
      { destination: SidebarDestination.Solutions, labelKey: 'kits' },
      { destination: SidebarDestination.Connections, labelKey: 'mcpServers' },
    ],
  },
] as const;

export const SIDEBAR_WORKSPACE_DESTINATIONS = [
  { destination: SidebarDestination.TaskHistory, labelKey: 'taskHistory' },
  { destination: SidebarDestination.Assistants, labelKey: 'myAgents' },
] as const;

export type SettingsTabId =
  | 'general'
  | 'personalization'
  | 'appearance'
  | 'coworkAgentEngine'
  | 'model'
  | 'browserWebAccess'
  | 'coworkMemory'
  | 'coworkDreaming'
  | 'shortcuts'
  | 'im'
  | 'email'
  | 'plugins'
  | 'about';

export const SettingsModuleId = {
  PersonalInterface: 'personalInterface',
  IntelligentCore: 'intelligentCore',
  MemorySystem: 'memorySystem',
  ConnectionChannels: 'connectionChannels',
  Extensions: 'extensions',
  SystemSupport: 'systemSupport',
} as const;

export type SettingsModuleId =
  typeof SettingsModuleId[keyof typeof SettingsModuleId];

export type SettingsTabDefinition = {
  id: SettingsTabId;
  labelKey: string;
  descriptionKey: string;
  keywordsKey: string;
};

export type SettingsModuleDefinition = {
  id: SettingsModuleId;
  index: string;
  labelKey: string;
  descriptionKey: string;
  tabs: readonly SettingsTabDefinition[];
};

export const SETTINGS_MODULES: readonly SettingsModuleDefinition[] = [
  {
    id: SettingsModuleId.PersonalInterface,
    index: '01',
    labelKey: 'settingsModulePersonalInterface',
    descriptionKey: 'settingsModulePersonalInterfaceDescription',
    tabs: [
      { id: 'general', labelKey: 'general', descriptionKey: 'settingsTabGeneralDescription', keywordsKey: 'settingsTabGeneralKeywords' },
      { id: 'personalization', labelKey: 'personalization', descriptionKey: 'settingsTabPersonalizationDescription', keywordsKey: 'settingsTabPersonalizationKeywords' },
      { id: 'appearance', labelKey: 'appearance', descriptionKey: 'settingsTabAppearanceDescription', keywordsKey: 'settingsTabAppearanceKeywords' },
      { id: 'shortcuts', labelKey: 'shortcuts', descriptionKey: 'settingsTabShortcutsDescription', keywordsKey: 'settingsTabShortcutsKeywords' },
    ],
  },
  {
    id: SettingsModuleId.IntelligentCore,
    index: '02',
    labelKey: 'settingsModuleIntelligentCore',
    descriptionKey: 'settingsModuleIntelligentCoreDescription',
    tabs: [
      { id: 'model', labelKey: 'settingsCustomModel', descriptionKey: 'settingsTabModelDescription', keywordsKey: 'settingsTabModelKeywords' },
      { id: 'coworkAgentEngine', labelKey: 'coworkAgentEngine', descriptionKey: 'settingsTabRuntimeDescription', keywordsKey: 'settingsTabRuntimeKeywords' },
    ],
  },
  {
    id: SettingsModuleId.MemorySystem,
    index: '03',
    labelKey: 'settingsModuleMemorySystem',
    descriptionKey: 'settingsModuleMemorySystemDescription',
    tabs: [
      { id: 'coworkMemory', labelKey: 'coworkMemoryTitle', descriptionKey: 'settingsTabMemoryDescription', keywordsKey: 'settingsTabMemoryKeywords' },
      { id: 'coworkDreaming', labelKey: 'coworkMemoryTabDreaming', descriptionKey: 'settingsTabDreamingDescription', keywordsKey: 'settingsTabDreamingKeywords' },
    ],
  },
  {
    id: SettingsModuleId.ConnectionChannels,
    index: '04',
    labelKey: 'settingsModuleConnectionChannels',
    descriptionKey: 'settingsModuleConnectionChannelsDescription',
    tabs: [
      { id: 'browserWebAccess', labelKey: 'browserWebAccessTab', descriptionKey: 'settingsTabBrowserDescription', keywordsKey: 'settingsTabBrowserKeywords' },
      { id: 'im', labelKey: 'imBot', descriptionKey: 'settingsTabMessagingDescription', keywordsKey: 'settingsTabMessagingKeywords' },
      { id: 'email', labelKey: 'emailTab', descriptionKey: 'settingsTabEmailDescription', keywordsKey: 'settingsTabEmailKeywords' },
    ],
  },
  {
    id: SettingsModuleId.Extensions,
    index: '05',
    labelKey: 'settingsModuleExtensions',
    descriptionKey: 'settingsModuleExtensionsDescription',
    tabs: [
      { id: 'plugins', labelKey: 'pluginsTab', descriptionKey: 'settingsTabPluginsDescription', keywordsKey: 'settingsTabPluginsKeywords' },
    ],
  },
  {
    id: SettingsModuleId.SystemSupport,
    index: '06',
    labelKey: 'settingsModuleSystemSupport',
    descriptionKey: 'settingsModuleSystemSupportDescription',
    tabs: [
      { id: 'about', labelKey: 'about', descriptionKey: 'settingsTabAboutDescription', keywordsKey: 'settingsTabAboutKeywords' },
    ],
  },
];

// Compatibility export for integrations that still import the old symbol.
// The value now represents the module-to-tab information architecture.
export const SETTINGS_NAV_GROUPS = SETTINGS_MODULES;
