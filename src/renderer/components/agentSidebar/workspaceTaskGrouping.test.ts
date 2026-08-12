import { describe, expect, test } from 'vitest';

import type { AgentSidebarTaskNode } from './types';
import {
  getWorkspaceDisplayPath,
  groupWorkspaceTasks,
  normalizeWorkspacePath,
} from './workspaceTaskGrouping';

const makeTask = (
  id: string,
  cwd: string,
  updatedAt: number,
): AgentSidebarTaskNode => ({
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

describe('workspace task grouping', () => {
  test('normalizes Windows paths without case or separator differences', () => {
    expect(normalizeWorkspacePath('C:\\Work\\LobsterAI\\', 'win32'))
      .toBe(normalizeWorkspacePath('c:/work/lobsterai', 'win32'));
  });

  test('preserves case differences on non-Windows platforms', () => {
    expect(normalizeWorkspacePath('/Work/App', 'darwin'))
      .not.toBe(normalizeWorkspacePath('/work/app', 'darwin'));
  });

  test('collapses historical per-task directories to their workspace root', () => {
    expect(getWorkspaceDisplayPath('/work/app/.logicnest-tasks/task-1')).toBe('/work/app');
  });

  test('keeps default and empty workspaces in the work hub', () => {
    const result = groupWorkspaceTasks([
      makeTask('default', 'C:\\Work\\General', 30),
      makeTask('legacy-default', 'c:/work/general/.logicnest-tasks/old', 20),
      makeTask('empty', '', 10),
    ], 'C:/Work/General', 'win32');

    expect(result.generalTasks.map((task) => task.id)).toEqual([
      'default',
      'legacy-default',
      'empty',
    ]);
    expect(result.projectGroups).toEqual([]);
  });

  test('sorts projects by activity and keeps task order within each group', () => {
    const result = groupWorkspaceTasks([
      makeTask('app-new', '/work/app', 50),
      makeTask('site', '/work/site', 40),
      makeTask('app-old', '/work/app', 10),
    ], '/work/general', 'linux');

    expect(result.projectGroups.map((group) => group.label)).toEqual(['app', 'site']);
    expect(result.projectGroups[0].tasks.map((task) => task.id)).toEqual(['app-new', 'app-old']);
  });

  test('uses the shortest unique trailing path for duplicate folder names', () => {
    const result = groupWorkspaceTasks([
      makeTask('one', '/clients/alpha/app', 20),
      makeTask('two', '/clients/beta/app', 10),
    ], '/work/general', 'linux');

    expect(result.projectGroups.map((group) => group.label)).toEqual(['alpha/app', 'beta/app']);
  });
});
