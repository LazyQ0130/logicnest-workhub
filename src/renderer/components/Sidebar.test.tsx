// @vitest-environment jsdom

import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { LicensePhase } from '../../shared/license';
import { SidebarDestination, type SidebarDestination as SidebarDestinationType } from '../config/brandUi';

vi.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => selector({
    agent: { currentAgentId: 'main', agents: [] },
  }),
}));

vi.mock('../store/selectors/coworkSelectors', () => ({
  selectCoworkSessions: () => [],
  selectCurrentSessionId: () => null,
}));

vi.mock('./agentSidebar/MyAgentSidebarTree', () => ({
  default: ({
    displayMode,
    onTaskSelected,
    onAgentSelected,
  }: {
    displayMode: 'tasks' | 'assistants';
    onTaskSelected?: (params: { agentType: 'main'; isCurrentSession: boolean; taskStatus: string }) => void;
    onAgentSelected?: (params: { agentType: 'main' }) => void;
  }) => displayMode === 'tasks' ? (
    <button type="button" onClick={() => onTaskSelected?.({ agentType: 'main', isCurrentSession: false, taskStatus: 'completed' })}>
      模拟打开任务
    </button>
  ) : (
    <button type="button" onClick={() => onAgentSelected?.({ agentType: 'main' })}>
      模拟切换助手
    </button>
  ),
}));

vi.mock('./cowork/CoworkSearchModal', () => ({ default: () => null }));
vi.mock('./LicenseProfileMenu', () => ({
  default: ({ onShowSettings, onLogout }: { onShowSettings: () => void; onLogout: () => Promise<void> }) => (
    <div>
      <button type="button" onClick={onShowSettings}>账号设置</button>
      <button type="button" onClick={() => { void onLogout(); }}>退出登录</button>
    </div>
  ),
}));
vi.mock('../services/logReporter', () => ({
  LogReporterAction: { SidebarAction: 'sidebar' },
  reportYdAnalyzer: vi.fn().mockResolvedValue(false),
}));
vi.mock('../services/meetingRoom', () => ({
  meetingRoomService: {
    list: vi.fn().mockResolvedValue([]),
    onChanged: vi.fn(() => () => undefined),
  },
}));
vi.mock('../services/i18n', () => ({
  i18nService: {
    t: (key: string) => ({
      workHub: '工作中枢',
      scheduledTasks: '自动任务',
      skills: '能力库',
      kits: '方案库',
      mcpServers: '连接中心',
      taskHistory: '任务记录',
      myAgents: '专属助手',
      newChat: '新建任务',
      search: '搜索任务',
      brandNavGroupWork: '工作',
      brandNavGroupResources: '资源',
      brandPrimaryNavigation: '主要导航',
      brandWorkspaceNavigation: '工作空间',
      brandWorkspaceHint: '选择任务记录或专属助手查看内容',
      settings: '设置',
    } as Record<string, string>)[key] ?? key,
  },
}));

import Sidebar from './Sidebar';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const callbacks = {
  settings: vi.fn(),
  skills: vi.fn(),
  cowork: vi.fn(),
  scheduled: vi.fn(),
  meetings: vi.fn(),
  kits: vi.fn(),
  mcp: vi.fn(),
  sites: vi.fn(),
  newChat: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
};

const Harness: React.FC = () => {
  const [destination, setDestination] = useState<SidebarDestinationType>(SidebarDestination.WorkHub);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setCollapsed((value) => !value)}>切换收起</button>
      <Sidebar
        onShowSettings={callbacks.settings}
        licenseState={{
          phase: LicensePhase.Authorized,
          user: { uid: 'user-1', phoneMasked: '138****0000', status: 'active' },
          membership: { status: 'active', expiresAt: '2099-01-01T00:00:00.000Z' },
          device: null,
          offlineUntil: null,
          lastServerTime: null,
          heartbeatAfterSeconds: 300,
        }}
        onLicenseLogout={callbacks.logout}
        activeView="cowork"
        activeDestination={destination}
        onDestinationChange={setDestination}
        onShowSkills={callbacks.skills}
        onShowCowork={callbacks.cowork}
        onShowScheduledTasks={callbacks.scheduled}
        onShowMeetingRooms={callbacks.meetings}
        onShowKits={callbacks.kits}
        onShowMcp={callbacks.mcp}
        onShowSites={callbacks.sites}
        onNewChat={callbacks.newChat}
        isCollapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        hideSites
      />
    </>
  );
};

const clickButton = (container: ParentNode, text: string) => {
  const button = Array.from(container.querySelectorAll('button'))
    .find((item) => item.textContent?.trim() === text) as HTMLButtonElement | undefined;
  expect(button, `button ${text}`).toBeTruthy();
  act(() => button?.click());
  return button;
};

describe('Sidebar information architecture', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.values(callbacks).forEach((callback) => callback.mockClear());
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: { platform: 'win32' },
    });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  test('routes all seven entries through their intended callbacks', () => {
    clickButton(container, '工作中枢');
    clickButton(container, '自动任务');
    clickButton(container, '能力库');
    clickButton(container, '方案库');
    clickButton(container, '连接中心');
    clickButton(container, '任务记录');
    clickButton(container, '专属助手');

    expect(callbacks.newChat).toHaveBeenCalledTimes(1);
    expect(callbacks.scheduled).toHaveBeenCalledTimes(1);
    expect(callbacks.skills).toHaveBeenCalledTimes(1);
    expect(callbacks.kits).toHaveBeenCalledTimes(1);
    expect(callbacks.mcp).toHaveBeenCalledTimes(1);
    expect(callbacks.cowork).toHaveBeenCalledTimes(2);
  });

  test('keeps exactly one selected entry and does not mismatch home with task history', () => {
    const selectedCount = () => container.querySelectorAll('[aria-current="page"], [role="tab"][aria-selected="true"]').length;
    expect(selectedCount()).toBe(1);

    clickButton(container, '任务记录');
    expect(selectedCount()).toBe(1);
    expect(clickButton(container, '工作中枢')?.getAttribute('aria-current')).toBe('page');
    expect(selectedCount()).toBe(1);
    expect(Array.from(container.querySelectorAll('[role="tab"]')).every((tab) => tab.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  test('task and assistant selection preserve semantics without opening settings', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    clickButton(container, '任务记录');
    clickButton(container, '模拟打开任务');
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('任务记录');

    clickButton(container, '专属助手');
    clickButton(container, '模拟切换助手');
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('专属助手');
    expect(dispatchSpy.mock.calls.some(([event]) => event.type === 'cowork:open-current-agent-settings')).toBe(false);
  });

  test('preserves the controlled destination through collapse and expansion', () => {
    clickButton(container, '任务记录');
    clickButton(container, '切换收起');
    clickButton(container, '切换收起');
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('任务记录');
  });

  test('routes account settings and license logout through the profile entry', () => {
    clickButton(container, '账号设置');
    clickButton(container, '退出登录');
    expect(callbacks.settings).toHaveBeenCalledTimes(1);
    expect(callbacks.logout).toHaveBeenCalledTimes(1);
  });
});
