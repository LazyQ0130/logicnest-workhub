import { describe, expect, test } from 'vitest';

import {
  SETTINGS_MODULES,
  SIDEBAR_NAV_GROUPS,
  SIDEBAR_WORKSPACE_DESTINATIONS,
  SidebarDestination,
} from './brandUi';

describe('brand UI information architecture', () => {
  test('keeps one primary navigation and a separate two-tab workspace', () => {
    expect(SIDEBAR_NAV_GROUPS.map((group) => group.id)).toEqual([
      'work',
      'resources',
    ]);
    expect(SIDEBAR_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.destination)))
      .toEqual([
        SidebarDestination.WorkHub,
        SidebarDestination.MeetingRooms,
        SidebarDestination.Automations,
        SidebarDestination.Capabilities,
        SidebarDestination.Solutions,
        SidebarDestination.Connections,
      ]);
    expect(SIDEBAR_WORKSPACE_DESTINATIONS.map((item) => item.destination)).toEqual([
      SidebarDestination.TaskHistory,
      SidebarDestination.Assistants,
    ]);
  });

  test('keeps legacy settings tab ids while presenting the settings-center modules', () => {
    expect(SETTINGS_MODULES.map((group) => group.id)).toEqual([
      'personalInterface',
      'intelligentCore',
      'memorySystem',
      'connectionChannels',
      'extensions',
      'systemSupport',
    ]);
    expect(SETTINGS_MODULES.flatMap((group) => group.tabs.map((tab) => tab.id))).toEqual([
      'general',
      'personalization',
      'appearance',
      'shortcuts',
      'model',
      'coworkAgentEngine',
      'coworkMemory',
      'coworkDreaming',
      'browserWebAccess',
      'im',
      'email',
      'plugins',
      'about',
    ]);
  });
});
