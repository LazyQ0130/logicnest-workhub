// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AgentSidebarAgentNode, AgentSidebarTaskNode } from './types';

vi.mock('../../services/i18n', () => ({
  i18nService: {
    t: (key: string) => ({
      myAgentSidebarProjects: 'Projects',
      myAgentSidebarProjectUnavailable: 'Project unavailable',
      myAgentSidebarNewProjectTask: 'New task in {project}',
      myAgentSidebarLoadFailed: 'Load failed',
      myAgentSidebarExpandMore: 'Show more',
      myAgentSidebarCollapse: 'Show less',
    } as Record<string, string>)[key] ?? key,
  },
}));

vi.mock('./AgentTreeNode', () => ({
  default: ({
    agent,
    onCreateTask,
  }: {
    agent: AgentSidebarAgentNode;
    onCreateTask: (agent: AgentSidebarAgentNode) => void;
  }) => (
    <div data-testid="general-group">
      <span>{agent.tasks.map((task) => task.id).join(',')}</span>
      <button type="button" onClick={() => onCreateTask(agent)}>New general task</button>
    </div>
  ),
}));

vi.mock('./AgentTaskRow', () => ({
  default: ({ task, onSelect }: { task: AgentSidebarTaskNode; onSelect: () => void }) => (
    <button type="button" onClick={onSelect}>{task.id}</button>
  ),
}));

vi.mock('./ExpandAgentTasksRow', () => ({ default: () => <div>Pagination</div> }));

import WorkspaceTaskGroups from './WorkspaceTaskGroups';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const makeTask = (id: string, cwd: string, updatedAt: number): AgentSidebarTaskNode => ({
  id,
  agentId: 'main',
  title: id,
  status: 'completed',
  pinned: false,
  cwd,
  updatedAt,
  createdAt: updatedAt,
  indicator: 'none',
  isSelected: false,
});

const makeAgent = (): AgentSidebarAgentNode => ({
  id: 'main',
  name: 'Work Hub',
  icon: '',
  enabled: true,
  pinned: false,
  isExpanded: true,
  isTaskListExpanded: false,
  canExpandTasks: false,
  canCollapseTasks: false,
  isLoadingTasks: false,
  hasLoadError: false,
  tasks: [
    makeTask('general-task', 'C:/General', 30),
    makeTask('project-task', 'C:/Projects/App', 20),
  ],
});

describe('WorkspaceTaskGroups', () => {
  let container: HTMLDivElement;
  let root: Root;
  const statFile = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    statFile.mockReset();
    statFile.mockResolvedValue({ success: true, isDirectory: true });
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        platform: 'win32',
        dialog: { statFile },
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const renderGroups = async (overrides: Record<string, unknown> = {}) => {
    const props: React.ComponentProps<typeof WorkspaceTaskGroups> = {
      agent: makeAgent(),
      defaultWorkingDirectory: 'C:/General',
      platform: 'win32',
      collapsedWorkspaceKeySet: new Set(),
      onToggleWorkspaceCollapsed: vi.fn(),
      onCreateTaskForDirectory: vi.fn(),
      isCurrentAgent: true,
      isBatchMode: false,
      batchAgentId: null,
      selectedKeys: new Set(),
      showBatchOption: true,
      onToggleExpanded: vi.fn(),
      onSelectAgent: vi.fn(),
      onEditAgent: vi.fn(),
      onDeleteAgent: vi.fn().mockResolvedValue(undefined),
      onToggleAgentPin: vi.fn().mockResolvedValue(undefined),
      onRetryLoadTasks: vi.fn(),
      onLoadMoreTasks: vi.fn(),
      onCollapseTasks: vi.fn(),
      onSelectTask: vi.fn(),
      onDeleteTask: vi.fn().mockResolvedValue(undefined),
      onShareTask: vi.fn().mockResolvedValue(undefined),
      onToggleTaskPin: vi.fn().mockResolvedValue(undefined),
      onRenameTask: vi.fn().mockResolvedValue(undefined),
      onToggleSelection: vi.fn(),
      onEnterBatchMode: vi.fn(),
      onSidebarAction: vi.fn(),
      getTaskActionParams: vi.fn(() => ({
        agentType: 'main' as const,
        isCurrentSession: false,
        isPinned: false,
        taskStatus: 'completed',
      })),
      ...overrides,
    };

    await act(async () => {
      root.render(<WorkspaceTaskGroups {...props} />);
      await Promise.resolve();
    });
    return props;
  };

  test('keeps default-directory tasks in the work hub and renders projects separately', async () => {
    await renderGroups();

    expect(container.querySelector('[data-testid="general-group"]')?.textContent)
      .toContain('general-task');
    expect(container.textContent).toContain('Projects');
    expect(container.textContent).toContain('App');
    expect(container.textContent).toContain('project-task');
  });

  test('uses the project directory when creating from a project group', async () => {
    const props = await renderGroups();
    const button = Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.getAttribute('aria-label') === 'New task in App');

    act(() => button?.click());

    expect(props.onCreateTaskForDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'main' }),
      'C:/Projects/App',
    );
  });

  test('keeps a collapsed project header visible and hides its tasks', async () => {
    const onToggleWorkspaceCollapsed = vi.fn();
    await renderGroups({
      collapsedWorkspaceKeySet: new Set(['project:c:/projects/app']),
      onToggleWorkspaceCollapsed,
    });
    const projectHeader = Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.includes('App'));

    expect(container.textContent).not.toContain('project-task');
    act(() => projectHeader?.click());
    expect(onToggleWorkspaceCollapsed).toHaveBeenCalledWith('project:c:/projects/app');
  });

  test('keeps missing projects visible but disables creating new tasks', async () => {
    statFile.mockResolvedValue({ success: false, error: 'ENOENT' });
    await renderGroups();
    const button = Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.getAttribute('aria-label') === 'New task in App');

    expect(button?.hasAttribute('disabled')).toBe(true);
    expect(container.textContent).toContain('project-task');
  });
});
