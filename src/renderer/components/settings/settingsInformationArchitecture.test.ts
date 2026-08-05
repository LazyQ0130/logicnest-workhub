import { describe, expect, test } from 'vitest';

import { SETTINGS_MODULES } from '../../config/brandUi';
import {
  findSettingsModuleByTab,
  getVisibleSettingsModules,
  searchSettings,
  shouldOpenSettingsDetail,
} from './settingsInformationArchitecture';

const translate = (key: string): string => ({
  settingsModulePersonalInterface: '个人与界面',
  settingsModulePersonalInterfaceDescription: '管理应用行为、个人资料、视觉主题与快捷操作。',
  personalization: '个性化',
  settingsTabPersonalizationDescription: '当前账号资料和此设备上的本地头像。',
  settingsTabPersonalizationKeywords: '账号 昵称 签名 头像 上传',
  settingsModuleConnectionChannels: '连接通道',
  settingsModuleConnectionChannelsDescription: '管理网页访问、消息与邮件接入。',
  browserWebAccessTab: '网页访问',
  settingsTabBrowserDescription: '默认安全策略、局域网风险和站点规则。',
  settingsTabBrowserKeywords: '网页 浏览器 SSRF 局域网 安全 站点规则',
}[key] ?? key);

describe('settings center information architecture', () => {
  test('maps every legacy settings tab to exactly one of the six modules', () => {
    const tabs = SETTINGS_MODULES.flatMap((module) => module.tabs.map((tab) => tab.id));
    expect(SETTINGS_MODULES).toHaveLength(6);
    expect(new Set(tabs).size).toBe(tabs.length);
    expect(tabs).toEqual([
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

  test('removes enterprise-hidden tabs from modules and search', () => {
    const modules = getVisibleSettingsModules({
      isAuthenticated: true,
      enterpriseUi: { 'settings.browserWebAccess': 'hide' },
    });
    expect(findSettingsModuleByTab(modules, 'browserWebAccess')).toBeUndefined();
    expect(searchSettings('SSRF', modules, translate)).toEqual([]);
  });

  test('hides personalization while signed out without hiding its sibling module', () => {
    const modules = getVisibleSettingsModules({ isAuthenticated: false });
    expect(findSettingsModuleByTab(modules, 'personalization')).toBeUndefined();
    expect(findSettingsModuleByTab(modules, 'general')?.id).toBe('personalInterface');
    expect(searchSettings('头像', modules, translate)).toEqual([]);
  });

  test('searches local module, label, description, and keyword copy and resolves a direct tab jump', () => {
    const modules = getVisibleSettingsModules({ isAuthenticated: true });
    expect(searchSettings('个人资料', modules, translate).map((result) => result.tab.id))
      .toContain('personalization');
    expect(searchSettings('SSRF', modules, translate).map((result) => result.tab.id))
      .toEqual(['browserWebAccess']);
  });

  test('opens a visible initialTab directly and rejects a hidden deep link', () => {
    const modules = getVisibleSettingsModules({
      isAuthenticated: true,
      enterpriseUi: { 'settings.coworkAgentEngine': 'hide' },
    });
    expect(shouldOpenSettingsDetail('model', modules)).toBe(true);
    expect(shouldOpenSettingsDetail('coworkAgentEngine', modules)).toBe(false);
    expect(shouldOpenSettingsDetail(undefined, modules)).toBe(false);
  });
});
