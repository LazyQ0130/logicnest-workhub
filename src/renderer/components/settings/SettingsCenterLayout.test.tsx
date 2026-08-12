// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { SettingsCenterToolbar, SettingsHome, SettingsModuleHeader } from './SettingsCenterLayout';
import { getVisibleSettingsModules, searchSettings } from './settingsInformationArchitecture';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const translations: Record<string, string> = {
  close: '关闭',
  settingsCenterBack: '返回设置首页',
  settingsCenterTitle: '设置中心',
  settingsCenterSearchPlaceholder: '搜索设置',
  settingsCenterSearchResults: '搜索结果',
  settingsCenterSearchNoResults: '没有找到相关设置',
  settingsCenterHome: '设置首页',
  settingsCenterHomeTitle: '逻栖工枢设置中心',
  settingsCenterHomeDescription: '按工作场景查找设置。',
  settingsCenterEnterModule: '进入模块',
  settingsCenterItemUnit: '项',
  settingsModulePersonalInterface: '个人与界面',
  settingsModulePersonalInterfaceDescription: '管理应用行为、个人资料、视觉主题与快捷操作。',
  general: '通用',
  settingsTabGeneralDescription: '语言、启动、通知、自动任务、数据与隐私。',
  settingsTabGeneralKeywords: '应用行为 通知 自动任务',
  personalization: '个性化',
  settingsTabPersonalizationDescription: '当前账号资料和此设备上的本地头像。',
  settingsTabPersonalizationKeywords: '账号 头像',
  appearance: '外观',
  settingsTabAppearanceDescription: '主题与字体。',
  settingsTabAppearanceKeywords: '主题 字体',
  shortcuts: '快捷操作',
  settingsTabShortcutsDescription: '编辑快捷键。',
  settingsTabShortcutsKeywords: '快捷键',
};
const translate = (key: string): string => translations[key] ?? key;

describe('settings center layout interaction', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  test('renders the module home as a two-level entry surface', () => {
    const modules = getVisibleSettingsModules({ isAuthenticated: true }).slice(0, 2);
    const onOpenModule = vi.fn();
    act(() => root.render(
      <SettingsHome modules={modules} translate={translate} onOpenModule={onOpenModule} />,
    ));
    const cards = container.querySelectorAll('button');
    expect(cards).toHaveLength(2);
    expect(cards[0].classList.contains('rounded-[14px]')).toBe(true);
    expect(cards[0].classList.contains('min-h-[152px]')).toBe(true);
    expect(cards[0].closest('.grid')?.classList.contains('gap-4')).toBe(true);
    const enterIcon = cards[0].querySelector<HTMLElement>('[data-settings-enter-icon="true"]');
    expect(enterIcon?.classList.contains('rounded-full')).toBe(true);
    expect(enterIcon?.classList.contains('h-8')).toBe(true);
    act(() => (cards[0] as HTMLButtonElement).click());
    expect(onOpenModule).toHaveBeenCalledWith('general');
  });

  test('moves and activates horizontal module tabs with arrow keys', () => {
    const module = getVisibleSettingsModules({ isAuthenticated: true })[0];
    const onTabChange = vi.fn();
    act(() => root.render(
      <SettingsModuleHeader
        module={module}
        activeTab="general"
        translate={translate}
        onBack={vi.fn()}
        onTabChange={onTabChange}
      />,
    ));
    const selectedTab = container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
    act(() => selectedTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(onTabChange).toHaveBeenCalledWith('personalization');
  });

  test('search result selection requests a direct tab jump without network behavior', () => {
    const modules = getVisibleSettingsModules({ isAuthenticated: true });
    const results = searchSettings('头像', modules, translate);
    const onResultSelect = vi.fn();
    act(() => root.render(
      <SettingsCenterToolbar
        isHome
        query="头像"
        results={results}
        translate={translate}
        onBack={vi.fn()}
        onClose={vi.fn()}
        onQueryChange={vi.fn()}
        onResultSelect={onResultSelect}
      />,
    ));
    const resultButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('个性化'));
    act(() => resultButton?.click());
    expect(onResultSelect).toHaveBeenCalledWith('personalization');
  });

  test('keeps the full visible back control clickable outside the window drag region', () => {
    const onBack = vi.fn();
    act(() => root.render(
      <SettingsCenterToolbar
        isHome={false}
        query=""
        results={[]}
        translate={translate}
        onBack={onBack}
        onClose={vi.fn()}
        onQueryChange={vi.fn()}
        onResultSelect={vi.fn()}
      />,
    ));
    const backButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="返回设置首页"]',
    );
    expect(backButton?.classList.contains('non-draggable')).toBe(true);
    expect(backButton?.classList.contains('h-11')).toBe(true);
    expect(backButton?.classList.contains('w-11')).toBe(true);
    expect(backButton?.classList.contains('rounded-xl')).toBe(true);
    act(() => backButton?.click());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('uses the settings toolbar as a window drag region without capturing controls', () => {
    act(() => root.render(
      <SettingsCenterToolbar
        isHome
        query=""
        results={[]}
        translate={translate}
        onBack={vi.fn()}
        onClose={vi.fn()}
        onQueryChange={vi.fn()}
        onResultSelect={vi.fn()}
      />,
    ));

    const toolbar = container.querySelector('header');
    const search = container.querySelector('input[type="search"]');
    const toolbarButtons = container.querySelectorAll<HTMLButtonElement>('header button');
    const closeButton = toolbarButtons.item(toolbarButtons.length - 1);

    expect(toolbar?.classList.contains('draggable')).toBe(true);
    expect(toolbar?.classList.contains('non-draggable')).toBe(false);
    expect(search?.parentElement?.classList.contains('non-draggable')).toBe(true);
    expect(closeButton?.classList.contains('non-draggable')).toBe(true);
  });
});
