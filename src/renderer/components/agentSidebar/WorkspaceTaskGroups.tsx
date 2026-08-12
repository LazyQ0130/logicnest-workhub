import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useMemo, useState } from 'react';

import { i18nService } from '../../services/i18n';
import ChevronRightIcon from '../icons/ChevronRightIcon';
import ComposeIcon from '../icons/ComposeIcon';
import FolderIcon from '../icons/FolderIcon';
import AgentTaskRow from './AgentTaskRow';
import AgentTreeNode from './AgentTreeNode';
import { createSessionBatchKey } from './batchSelection';
import ExpandAgentTasksRow from './ExpandAgentTasksRow';
import type { AgentSidebarAgentNode } from './types';
import {
  groupWorkspaceTasks,
  type WorkspaceTaskGroup,
} from './workspaceTaskGrouping';

type ForwardedAgentTreeProps = Omit<
  React.ComponentProps<typeof AgentTreeNode>,
  'agent' | 'displayMode' | 'onCreateTask'
>;

interface WorkspaceTaskGroupsProps extends ForwardedAgentTreeProps {
  agent: AgentSidebarAgentNode;
  defaultWorkingDirectory: string;
  platform: string;
  collapsedWorkspaceKeySet: Set<string>;
  onToggleWorkspaceCollapsed: (workspaceKey: string) => void;
  onCreateTaskForDirectory: (agent: AgentSidebarAgentNode, cwd: string) => void;
}

type WorkspaceAvailability = 'available' | 'missing';

const WorkspaceTaskGroups: React.FC<WorkspaceTaskGroupsProps> = ({
  agent,
  defaultWorkingDirectory,
  platform,
  collapsedWorkspaceKeySet,
  onToggleWorkspaceCollapsed,
  onCreateTaskForDirectory,
  isBatchMode,
  batchAgentId,
  selectedKeys,
  showBatchOption,
  onRetryLoadTasks,
  onLoadMoreTasks,
  onCollapseTasks,
  onSelectTask,
  onDeleteTask,
  onShareTask,
  onToggleTaskPin,
  onRenameTask,
  onToggleSelection,
  onEnterBatchMode,
  onSidebarAction,
  getTaskActionParams,
  ...generalAgentProps
}) => {
  const { generalTasks, projectGroups } = useMemo(() => {
    return groupWorkspaceTasks(agent.tasks, defaultWorkingDirectory, platform);
  }, [agent.tasks, defaultWorkingDirectory, platform]);
  const [availabilityByWorkspaceKey, setAvailabilityByWorkspaceKey] = useState<
    Record<string, WorkspaceAvailability>
  >({});

  useEffect(() => {
    let cancelled = false;

    const checkProjectDirectories = async () => {
      const results = await Promise.all(projectGroups.map(async (group) => {
        try {
          const result = await window.electron.dialog.statFile(group.path);
          return [
            group.key,
            result.success && result.isDirectory ? 'available' : 'missing',
          ] as const;
        } catch {
          return [group.key, 'missing'] as const;
        }
      }));
      if (cancelled) return;
      setAvailabilityByWorkspaceKey(Object.fromEntries(results));
    };

    void checkProjectDirectories();
    return () => {
      cancelled = true;
    };
  }, [projectGroups]);

  const isBatchAgent = isBatchMode && batchAgentId === agent.id;
  const isOutsideBatchAgent = isBatchMode && batchAgentId !== null && batchAgentId !== agent.id;
  const generalAgent: AgentSidebarAgentNode = {
    ...agent,
    tasks: generalTasks,
    canExpandTasks: false,
    canCollapseTasks: false,
    isLoadingTasks: agent.isLoadingTasks && agent.tasks.length === 0,
    hasLoadError: agent.hasLoadError && agent.tasks.length === 0,
  };

  const renderProjectGroup = (group: WorkspaceTaskGroup) => {
    const isCollapsed = collapsedWorkspaceKeySet.has(group.key);
    const isMissing = availabilityByWorkspaceKey[group.key] === 'missing';
    const unavailableLabel = i18nService.t('myAgentSidebarProjectUnavailable');
    const headerTitle = isMissing ? `${group.path} · ${unavailableLabel}` : group.path;

    return (
      <div key={group.key} className="space-y-0.5">
        <div className="group relative -ml-[6px] h-7 w-[calc(100%+12px)]">
          <button
            type="button"
            onClick={() => onToggleWorkspaceCollapsed(group.key)}
            className="flex h-full w-full items-center gap-2 rounded-md py-0 pl-3.5 pr-10 text-left text-sm font-normal text-foreground transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            role="treeitem"
            aria-level={1}
            aria-expanded={!isCollapsed}
            title={headerTitle}
          >
            <ChevronRightIcon
              className={`h-3 w-3 shrink-0 text-secondary transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            />
            <FolderIcon className={`h-4 w-4 shrink-0 ${isMissing ? 'text-warning' : 'text-foreground'}`} />
            <span className="min-w-0 flex-1 truncate">{group.label}</span>
            {isMissing && (
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-warning">
                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                <span className="max-w-[72px] truncate">{unavailableLabel}</span>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCreateTaskForDirectory(agent, group.path);
            }}
            disabled={isMissing}
            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-foreground opacity-0 transition-opacity hover:opacity-50 disabled:cursor-not-allowed disabled:opacity-20 group-hover:opacity-30 group-focus-within:opacity-30"
            aria-label={i18nService
              .t('myAgentSidebarNewProjectTask')
              .replace('{project}', group.label)}
            title={isMissing ? unavailableLabel : undefined}
          >
            <ComposeIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {!isCollapsed && (
          <div role="group" className="min-w-0 max-w-full space-y-0.5">
            {group.tasks.map((task) => (
              <AgentTaskRow
                key={task.id}
                task={task}
                isBatchMode={isBatchAgent}
                isSelected={selectedKeys.has(createSessionBatchKey(task.id))}
                isSelectionDisabled={isOutsideBatchAgent}
                showBatchOption={showBatchOption && !isBatchMode}
                onSelect={() => onSelectTask(task)}
                onDelete={() => onDeleteTask(task)}
                onShare={() => onShareTask(task)}
                onTogglePin={(pinned) => onToggleTaskPin(task, pinned)}
                onRename={(title) => onRenameTask(task, title)}
                onToggleSelection={() => onToggleSelection(createSessionBatchKey(task.id), task.agentId)}
                onEnterBatchMode={() => onEnterBatchMode(task)}
                onSidebarAction={onSidebarAction}
                analyticsParams={getTaskActionParams?.(task)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      <AgentTreeNode
        {...generalAgentProps}
        agent={generalAgent}
        displayMode="tasks"
        isBatchMode={isBatchMode}
        batchAgentId={batchAgentId}
        selectedKeys={selectedKeys}
        showBatchOption={showBatchOption}
        onCreateTask={() => onCreateTaskForDirectory(agent, defaultWorkingDirectory)}
        onRetryLoadTasks={onRetryLoadTasks}
        onLoadMoreTasks={onLoadMoreTasks}
        onCollapseTasks={onCollapseTasks}
        onSelectTask={onSelectTask}
        onDeleteTask={onDeleteTask}
        onShareTask={onShareTask}
        onToggleTaskPin={onToggleTaskPin}
        onRenameTask={onRenameTask}
        onToggleSelection={onToggleSelection}
        onEnterBatchMode={onEnterBatchMode}
        onSidebarAction={onSidebarAction}
        getTaskActionParams={getTaskActionParams}
      />

      {projectGroups.length > 0 && (
        <div className="space-y-0.5 pt-2">
          <div className="flex h-8 items-center px-2 text-xs font-medium text-secondary">
            {i18nService.t('myAgentSidebarProjects')}
          </div>
          {projectGroups.map(renderProjectGroup)}
        </div>
      )}

      {agent.hasLoadError && agent.tasks.length > 0 && (
        <button
          type="button"
          onClick={() => onRetryLoadTasks(agent.id)}
          className="-ml-[6px] flex h-7 w-[calc(100%+12px)] items-center rounded-md pl-[38px] pr-2.5 text-left text-[13px] text-red-500 transition-colors hover:bg-red-500/10"
        >
          {i18nService.t('myAgentSidebarLoadFailed')}
        </button>
      )}

      {(agent.canExpandTasks || agent.canCollapseTasks) && (
        <ExpandAgentTasksRow
          isLoading={agent.isLoadingTasks}
          label={agent.canExpandTasks
            ? i18nService.t('myAgentSidebarExpandMore')
            : i18nService.t('myAgentSidebarCollapse')}
          onClick={() => {
            if (agent.canExpandTasks) {
              onLoadMoreTasks(agent.id);
            } else {
              onCollapseTasks(agent.id);
            }
          }}
          secondaryLabel={agent.canExpandTasks && agent.canCollapseTasks
            ? i18nService.t('myAgentSidebarCollapse')
            : undefined}
          onSecondaryClick={agent.canExpandTasks && agent.canCollapseTasks
            ? () => onCollapseTasks(agent.id)
            : undefined}
        />
      )}
    </div>
  );
};

export default WorkspaceTaskGroups;
