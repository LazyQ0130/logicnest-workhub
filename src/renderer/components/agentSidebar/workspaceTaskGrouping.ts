import type { AgentSidebarTaskNode } from './types';

const LEGACY_TASK_WORKSPACE_DIRECTORY = '.logicnest-tasks';

export const WorkspaceTaskGroupKind = {
  General: 'general',
  Project: 'project',
} as const;

export type WorkspaceTaskGroupKind =
  typeof WorkspaceTaskGroupKind[keyof typeof WorkspaceTaskGroupKind];

export interface WorkspaceTaskGroup {
  key: string;
  kind: WorkspaceTaskGroupKind;
  path: string;
  label: string;
  updatedAt: number;
  tasks: AgentSidebarTaskNode[];
}

export interface WorkspaceTaskGroupingResult {
  generalTasks: AgentSidebarTaskNode[];
  projectGroups: WorkspaceTaskGroup[];
}

const stripLegacyTaskWorkspaceSuffix = (normalizedPath: string): string => {
  const marker = `/${LEGACY_TASK_WORKSPACE_DIRECTORY}/`;
  const markerIndex = normalizedPath.toLowerCase().lastIndexOf(marker);
  if (markerIndex > 0) {
    return normalizedPath.slice(0, markerIndex);
  }
  if (normalizedPath.toLowerCase().endsWith(`/${LEGACY_TASK_WORKSPACE_DIRECTORY}`)) {
    return normalizedPath.slice(0, -LEGACY_TASK_WORKSPACE_DIRECTORY.length - 1);
  }
  return normalizedPath;
};

const normalizeSeparators = (rawPath: string): string => {
  const trimmed = rawPath.trim().replace(/\\/g, '/');
  if (!trimmed) return '';

  const hasUncPrefix = trimmed.startsWith('//');
  const collapsed = trimmed.replace(/\/{2,}/g, '/');
  const withPrefix = hasUncPrefix ? `/${collapsed}` : collapsed;
  if (withPrefix === '/' || /^[A-Za-z]:\/$/.test(withPrefix)) {
    return withPrefix;
  }
  return withPrefix.replace(/\/+$/, '');
};

export const normalizeWorkspacePath = (
  rawPath: string,
  platform: string,
): string => {
  const withoutTaskSuffix = stripLegacyTaskWorkspaceSuffix(normalizeSeparators(rawPath));
  return platform === 'win32' ? withoutTaskSuffix.toLowerCase() : withoutTaskSuffix;
};

export const getWorkspaceDisplayPath = (rawPath: string): string => {
  return stripLegacyTaskWorkspaceSuffix(normalizeSeparators(rawPath));
};

const getPathSegments = (workspacePath: string): string[] => {
  return workspacePath.split('/').filter(Boolean);
};

const getShortestUniqueLabels = (
  groups: Array<Pick<WorkspaceTaskGroup, 'key' | 'path'>>,
  platform: string,
): Map<string, string> => {
  const labels = new Map<string, string>();

  groups.forEach((group) => {
    const segments = getPathSegments(group.path);
    if (segments.length === 0) {
      labels.set(group.key, group.path);
      return;
    }

    let label = segments[segments.length - 1];
    for (let suffixLength = 1; suffixLength <= segments.length; suffixLength += 1) {
      const candidate = segments.slice(-suffixLength).join('/');
      const normalizedCandidate = platform === 'win32' ? candidate.toLowerCase() : candidate;
      const isUnique = groups.every((other) => {
        if (other.key === group.key) return true;
        const otherSegments = getPathSegments(other.path);
        const otherCandidate = otherSegments.slice(-suffixLength).join('/');
        const normalizedOther = platform === 'win32'
          ? otherCandidate.toLowerCase()
          : otherCandidate;
        return normalizedOther !== normalizedCandidate;
      });
      label = candidate;
      if (isUnique) break;
    }
    labels.set(group.key, label);
  });

  return labels;
};

export const groupWorkspaceTasks = (
  tasks: AgentSidebarTaskNode[],
  defaultWorkingDirectory: string,
  platform: string,
): WorkspaceTaskGroupingResult => {
  const defaultWorkspaceKey = normalizeWorkspacePath(defaultWorkingDirectory, platform);
  const generalTasks: AgentSidebarTaskNode[] = [];
  const projectGroupsByKey = new Map<string, WorkspaceTaskGroup>();

  tasks.forEach((task) => {
    const workspaceKey = normalizeWorkspacePath(task.cwd || '', platform);
    if (!workspaceKey || workspaceKey === defaultWorkspaceKey) {
      generalTasks.push(task);
      return;
    }

    const groupKey = `${WorkspaceTaskGroupKind.Project}:${workspaceKey}`;
    const existing = projectGroupsByKey.get(groupKey);
    if (existing) {
      existing.tasks.push(task);
      existing.updatedAt = Math.max(existing.updatedAt, task.updatedAt || task.createdAt);
      return;
    }

    projectGroupsByKey.set(groupKey, {
      key: groupKey,
      kind: WorkspaceTaskGroupKind.Project,
      path: getWorkspaceDisplayPath(task.cwd),
      label: '',
      updatedAt: task.updatedAt || task.createdAt,
      tasks: [task],
    });
  });

  const projectGroups = Array.from(projectGroupsByKey.values())
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const labels = getShortestUniqueLabels(projectGroups, platform);

  projectGroups.forEach((group) => {
    group.label = labels.get(group.key) || group.path;
  });

  return { generalTasks, projectGroups };
};
