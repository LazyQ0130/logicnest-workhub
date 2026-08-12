import {
  ChatBubbleLeftRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  HomeIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { AgentId } from '@shared/agent';
import type { LicenseState } from '@shared/license';
import { MeetingRoomStatus } from '@shared/meetingRoom';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import {
  SIDEBAR_NAV_GROUPS,
  SIDEBAR_WORKSPACE_DESTINATIONS,
  SidebarDestination,
  type SidebarDestination as SidebarDestinationType,
} from '../config/brandUi';
import { agentService } from '../services/agent';
import { coworkService } from '../services/cowork';
import { i18nService } from '../services/i18n';
import { LogReporterAction, reportYdAnalyzer } from '../services/logReporter';
import { meetingRoomService } from '../services/meetingRoom';
import { RootState } from '../store';
import {
  selectCoworkSessions,
  selectCurrentSessionId,
} from '../store/selectors/coworkSelectors';
import type { CoworkSessionSummary } from '../types/cowork';
import { getAgentDisplayNameById } from '../utils/agentDisplay';
import {
  type AgentSidebarBatchItem,
  AgentSidebarBatchItemKind,
  createSessionBatchKey,
} from './agentSidebar/batchSelection';
import MyAgentSidebarTree from './agentSidebar/MyAgentSidebarTree';
import Modal from './common/Modal';
import { CoworkUiEvent } from './cowork/constants';
import CoworkSearchModal from './cowork/CoworkSearchModal';
import ComposeIcon from './icons/ComposeIcon';
import SidebarAutomationIcon from './icons/SidebarAutomationIcon';
import SidebarKitsIcon from './icons/SidebarKitsIcon';
import SidebarMcpIcon from './icons/SidebarMcpIcon';
import SidebarSearchIcon from './icons/SidebarSearchIcon';
import SidebarToggleIcon from './icons/SidebarToggleIcon';
import SkillIcon from './icons/SkillIcon';
import TrashIcon from './icons/TrashIcon';
import LicenseProfileMenu from './LicenseProfileMenu';

interface SidebarProps {
  onShowSettings: () => void;
  licenseState: LicenseState;
  onLicenseLogout: () => Promise<void>;
  activeView: 'cowork' | 'skills' | 'meetingRooms' | 'scheduledTasks' | 'kits' | 'mcp' | 'sites';
  activeDestination: SidebarDestinationType;
  onDestinationChange: (destination: SidebarDestinationType) => void;
  onShowSkills: () => void;
  onShowCowork: () => void;
  onShowScheduledTasks: () => void;
  onShowMeetingRooms: () => void;
  onShowKits: () => void;
  onShowMcp: () => void;
  onShowSites: () => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onWidthChange?: (width: number) => void;
  updateNotice?: React.ReactNode;
  /** The expanded update card owns the sidebar bottom; temporarily hide the
   * promo banner while preserving it for a smooth return after collapse. */
  hideAdBanner?: boolean;
  hideSites?: boolean;
}

const DEFAULT_SIDEBAR_WIDTH = 244;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 420;
const SIDEBAR_COLLAPSE_TRANSITION_MS = 200;
const normalizeAgentId = (agentId?: string | null) => agentId?.trim() || AgentId.Main;
const sidebarNavItemClassName =
  'w-full inline-flex h-8 items-center gap-2 rounded-lg px-2 text-left text-sm font-normal text-foreground transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]';
const activeSidebarNavItemClassName =
  `${sidebarNavItemClassName} bg-black/[0.07] font-semibold hover:bg-black/[0.07] dark:bg-white/[0.09] dark:hover:bg-white/[0.09]`;
const sidebarCreateIconClassName = 'h-4 w-4 shrink-0';

const sidebarDestinationIcons: Record<
  SidebarDestinationType,
  React.ComponentType<{ className?: string }>
> = {
  [SidebarDestination.WorkHub]: HomeIcon,
  [SidebarDestination.MeetingRooms]: ChatBubbleLeftRightIcon,
  [SidebarDestination.TaskHistory]: ClockIcon,
  [SidebarDestination.Automations]: SidebarAutomationIcon,
  [SidebarDestination.Assistants]: UserGroupIcon,
  [SidebarDestination.Capabilities]: SkillIcon,
  [SidebarDestination.Solutions]: SidebarKitsIcon,
  [SidebarDestination.Connections]: SidebarMcpIcon,
};

type SidebarAnalyticsSource = 'home_sidebar' | 'home_agent_sidebar';

interface SidebarAnalyticsOptions {
  activeView?: SidebarProps['activeView'];
  agentType?: 'main' | 'custom';
  hasActiveSubagent?: boolean;
  isCollapsed?: boolean;
  isCurrentSession?: boolean;
  isCurrentSubagent?: boolean;
  isExpanded?: boolean;
  isPinned?: boolean;
  isSelectAllChecked?: boolean;
  result?: 'success' | 'failed';
  selectedCount?: number;
  selectedSessionCount?: number;
  selectedSubagentCount?: number;
  selectableCount?: number;
  source?: SidebarAnalyticsSource;
  subagentStatus?: string;
  targetPinned?: boolean;
  targetSelected?: boolean;
  taskStatus?: string;
  visibleTaskCount?: number;
}

const reportSidebarAction = (
  actionType: string,
  options: SidebarAnalyticsOptions = {},
): void => {
  console.debug('[Sidebar] reporting sidebar action analytics');
  void reportYdAnalyzer({
    action: LogReporterAction.SidebarAction,
    source: options.source ?? 'home_sidebar',
    actionType,
    activeView: options.activeView,
    agentType: options.agentType,
    hasActiveSubagent: options.hasActiveSubagent,
    isCollapsed: options.isCollapsed,
    isCurrentSession: options.isCurrentSession,
    isCurrentSubagent: options.isCurrentSubagent,
    isExpanded: options.isExpanded,
    isPinned: options.isPinned,
    isSelectAllChecked: options.isSelectAllChecked,
    result: options.result,
    selectedCount: options.selectedCount,
    selectedSessionCount: options.selectedSessionCount,
    selectedSubagentCount: options.selectedSubagentCount,
    selectableCount: options.selectableCount,
    subagentStatus: options.subagentStatus,
    targetPinned: options.targetPinned,
    targetSelected: options.targetSelected,
    taskStatus: options.taskStatus,
    visibleTaskCount: options.visibleTaskCount,
  });
};

const Sidebar: React.FC<SidebarProps> = ({
  onShowSettings,
  licenseState,
  onLicenseLogout,
  activeView,
  activeDestination,
  onDestinationChange,
  onShowSkills,
  onShowCowork,
  onShowScheduledTasks,
  onShowMeetingRooms,
  onShowKits,
  onShowMcp,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  onWidthChange,
  updateNotice,
}) => {
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const agents = useSelector((state: RootState) => state.agent.agents);
  const sessions = useSelector(selectCoworkSessions);
  const currentSessionId = useSelector(selectCurrentSessionId);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchAgentId, setBatchAgentId] = useState<string | null>(null);
  const [batchSelectableItems, setBatchSelectableItems] = useState<AgentSidebarBatchItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deletedSessionIds, setDeletedSessionIds] = useState<string[]>([]);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [agentScrollEdges, setAgentScrollEdges] = useState({ top: false, bottom: false });
  const [hasRunningMeeting, setHasRunningMeeting] = useState(false);
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const agentScrollContainerRef = useRef<HTMLDivElement>(null);
  const isWindows = window.electron.platform === 'win32';
  const showHeaderRow = !isWindows;
  const batchSelectableKeySet = useMemo(
    () => new Set(batchSelectableItems.map((item) => item.key)),
    [batchSelectableItems],
  );
  const batchSelectableItemByKey = useMemo(() => {
    const itemByKey = new Map<string, AgentSidebarBatchItem>();
    batchSelectableItems.forEach((item) => itemByKey.set(item.key, item));
    return itemByKey;
  }, [batchSelectableItems]);
  const selectedBatchSelectableCount = useMemo(() => {
    return batchSelectableItems.filter((item) => selectedKeys.has(item.key)).length;
  }, [batchSelectableItems, selectedKeys]);
  const isBatchSelectAllChecked =
    batchSelectableItems.length > 0 && selectedBatchSelectableCount === batchSelectableItems.length;
  const batchAgentName = batchAgentId ? getAgentDisplayNameById(batchAgentId, agents) : null;
  const getBatchSelectionSummary = useCallback(() => {
    const selectedItems = Array.from(selectedKeys)
      .filter((key) => batchSelectableKeySet.size === 0 || batchSelectableKeySet.has(key))
      .map((key) => batchSelectableItemByKey.get(key))
      .filter((item): item is AgentSidebarBatchItem => Boolean(item));
    const selectedSessionCount = selectedItems.filter(
      (item) => item.kind === AgentSidebarBatchItemKind.Session,
    ).length;
    return {
      selectedCount: selectedItems.length,
      selectedSessionCount,
      selectedSubagentCount: 0,
      selectableCount: batchSelectableItems.length,
    };
  }, [batchSelectableItemByKey, batchSelectableItems.length, batchSelectableKeySet, selectedKeys]);

  useEffect(() => {
    const refresh = () => {
      void meetingRoomService.list()
        .then(rooms => setHasRunningMeeting(rooms.some(room => room.status === MeetingRoomStatus.Running)))
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = meetingRoomService.onChanged(refresh);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleSearch = () => {
      onDestinationChange(SidebarDestination.TaskHistory);
      onShowCowork();
      setIsSearchOpen(true);
    };
    window.addEventListener(CoworkUiEvent.ShortcutSearch, handleSearch);
    return () => {
      window.removeEventListener(CoworkUiEvent.ShortcutSearch, handleSearch);
    };
  }, [onDestinationChange, onShowCowork]);

  useEffect(() => {
    if (!isCollapsed) return;
    setIsSearchOpen(false);
    setIsBatchMode(false);
    setBatchAgentId(null);
    setBatchSelectableItems([]);
    setSelectedKeys(new Set());
    setShowBatchDeleteConfirm(false);
  }, [isCollapsed]);

  const handleSelectSession = async (session: CoworkSessionSummary) => {
    onDestinationChange(SidebarDestination.TaskHistory);
    const agentId = session.agentId?.trim() || AgentId.Main;
    try {
      if (agentId !== currentAgentId) {
        agentService.switchAgent(agentId, { targetSessionId: session.id });
        await coworkService.loadSessions(agentId);
      }
      onShowCowork();
      await coworkService.loadSession(session.id);
    } finally {
      coworkService.finishSessionNavigation(session.id);
    }
  };

  const handleSidebarDestination = useCallback((destination: SidebarDestinationType) => {
    setIsSearchOpen(false);
    onDestinationChange(destination);
    switch (destination) {
      case SidebarDestination.WorkHub:
        onNewChat();
        break;
      case SidebarDestination.TaskHistory:
        onShowCowork();
        break;
      case SidebarDestination.Automations:
        onShowScheduledTasks();
        break;
      case SidebarDestination.MeetingRooms:
        onShowMeetingRooms();
        break;
      case SidebarDestination.Assistants:
        onShowCowork();
        break;
      case SidebarDestination.Capabilities:
        onShowSkills();
        break;
      case SidebarDestination.Solutions:
        onShowKits();
        break;
      case SidebarDestination.Connections:
        onShowMcp();
        break;
    }
  }, [onDestinationChange, onNewChat, onShowCowork, onShowKits, onShowMcp, onShowMeetingRooms, onShowScheduledTasks, onShowSkills]);

  const isDestinationActive = useCallback((destination: SidebarDestinationType): boolean => {
    return activeDestination === destination;
  }, [activeDestination]);

  const handleEnterBatchMode = useCallback((sessionId: string, agentId: string) => {
    reportSidebarAction('batch_mode_enter', {
      source: 'home_agent_sidebar',
      agentType: normalizeAgentId(agentId) === AgentId.Main ? 'main' : 'custom',
      selectedCount: 1,
    });
    setIsBatchMode(true);
    setBatchAgentId(agentId);
    setBatchSelectableItems([]);
    setSelectedKeys(new Set([createSessionBatchKey(sessionId)]));
  }, []);

  const handleExitBatchMode = useCallback(() => {
    reportSidebarAction('batch_mode_exit', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      ...getBatchSelectionSummary(),
    });
    setIsBatchMode(false);
    setBatchAgentId(null);
    setBatchSelectableItems([]);
    setSelectedKeys(new Set());
    setShowBatchDeleteConfirm(false);
  }, [batchAgentId, getBatchSelectionSummary]);

  const handleBatchSelectableItemsChange = useCallback((items: AgentSidebarBatchItem[]) => {
    setBatchSelectableItems(items);
    setSelectedKeys((previous) => {
      if (!batchAgentId || items.length === 0) return previous;
      const itemKeySet = new Set(items.map((item) => item.key));
      const next = new Set(Array.from(previous).filter((key) => itemKeySet.has(key)));
      return next.size === previous.size ? previous : next;
    });
  }, [batchAgentId]);

  const updateAgentScrollEdges = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      setAgentScrollEdges((previousEdges) => (
        previousEdges.top || previousEdges.bottom ? { top: false, bottom: false } : previousEdges
      ));
      return;
    }

    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    const nextEdges = {
      top: element.scrollTop > 1,
      bottom: maxScrollTop - element.scrollTop > 1,
    };

    setAgentScrollEdges((previousEdges) => {
      if (previousEdges.top === nextEdges.top && previousEdges.bottom === nextEdges.bottom) {
        return previousEdges;
      }
      return nextEdges;
    });
  }, []);

  const handleAgentScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    updateAgentScrollEdges(event.currentTarget);
  }, [updateAgentScrollEdges]);

  const handleToggleSelection = useCallback((selectionKey: string, agentId: string) => {
    if (batchAgentId && normalizeAgentId(agentId) !== batchAgentId) return;
    setSelectedKeys(prev => {
      const next = new Set(prev);
      const targetSelected = !next.has(selectionKey);
      if (next.has(selectionKey)) {
        next.delete(selectionKey);
      } else {
        next.add(selectionKey);
      }
      reportSidebarAction('batch_item_toggle', {
        source: 'home_agent_sidebar',
        agentType: normalizeAgentId(agentId) === AgentId.Main ? 'main' : 'custom',
        selectedCount: next.size,
        selectableCount: batchSelectableItems.length,
        targetSelected,
      });
      return next;
    });
  }, [batchAgentId, batchSelectableItems.length]);

  const handleSelectAll = useCallback(() => {
    if (batchSelectableItems.length === 0) return;
    setSelectedKeys(prev => {
      const selectedVisibleCount = batchSelectableItems.filter((item) => prev.has(item.key)).length;
      if (selectedVisibleCount === batchSelectableItems.length) {
        reportSidebarAction('batch_select_all_toggle', {
          source: 'home_agent_sidebar',
          agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
          selectedCount: 0,
          selectableCount: batchSelectableItems.length,
          isSelectAllChecked: false,
        });
        return new Set();
      }
      reportSidebarAction('batch_select_all_toggle', {
        source: 'home_agent_sidebar',
        agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
        selectedCount: batchSelectableItems.length,
        selectableCount: batchSelectableItems.length,
        isSelectAllChecked: true,
      });
      return new Set(batchSelectableItems.map((item) => item.key));
    });
  }, [batchAgentId, batchSelectableItems]);

  const handleBatchDeleteClick = useCallback(() => {
    if (selectedKeys.size === 0) return;
    reportSidebarAction('batch_delete_confirm_open', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      ...getBatchSelectionSummary(),
    });
    setShowBatchDeleteConfirm(true);
  }, [batchAgentId, getBatchSelectionSummary, selectedKeys.size]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    const items = Array.from(selectedKeys)
      .filter((key) => batchSelectableKeySet.size === 0 || batchSelectableKeySet.has(key))
      .map((key) => batchSelectableItemByKey.get(key))
      .filter((item): item is AgentSidebarBatchItem => Boolean(item));
    if (items.length === 0) return;

    const sessionIds = items
      .filter((item) => item.kind === AgentSidebarBatchItemKind.Session)
      .map((item) => item.sessionId);
    const selectedSessionCount = sessionIds.length;

    reportSidebarAction('batch_delete_submit', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      selectedCount: items.length,
      selectedSessionCount,
      selectedSubagentCount: 0,
      selectableCount: batchSelectableItems.length,
    });

    let deletedSessions = false;
    if (sessionIds.length > 0) {
      deletedSessions = await coworkService.deleteSessions(sessionIds);
    }

    if (!deletedSessions) {
      reportSidebarAction('batch_delete_failed', {
        source: 'home_agent_sidebar',
        agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
        result: 'failed',
        selectedCount: items.length,
        selectedSessionCount,
        selectedSubagentCount: 0,
        selectableCount: batchSelectableItems.length,
      });
      return;
    }
    reportSidebarAction('batch_delete_success', {
      source: 'home_agent_sidebar',
      agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
      result: 'success',
      selectedCount: items.length,
      selectedSessionCount,
      selectedSubagentCount: 0,
      selectableCount: batchSelectableItems.length,
    });
    if (deletedSessions) {
      setDeletedSessionIds(sessionIds);
    }
    handleExitBatchMode();
  }, [
    batchAgentId,
    batchSelectableItemByKey,
    batchSelectableItems.length,
    batchSelectableKeySet,
    selectedKeys,
    handleExitBatchMode,
  ]);

  const handleResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isCollapsed) return;
    event.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = sidebarWidth;
    document.body.classList.add('select-none');

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const nextWidth = resizeStartWidthRef.current + moveEvent.clientX - resizeStartXRef.current;
      if (nextWidth < MIN_SIDEBAR_WIDTH) {
        isResizingRef.current = false;
        setIsResizing(false);
        document.body.classList.remove('select-none');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        onToggleCollapse();
        return;
      }
      const clampedWidth = Math.min(MAX_SIDEBAR_WIDTH, nextWidth);
      setSidebarWidth(clampedWidth);
      onWidthChange?.(clampedWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.classList.remove('select-none');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isCollapsed, onToggleCollapse, onWidthChange, sidebarWidth]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('select-none');
    };
  }, []);

  useEffect(() => {
    const element = agentScrollContainerRef.current;
    if (!element) return;

    updateAgentScrollEdges(element);

    const resizeObserver = new ResizeObserver(() => updateAgentScrollEdges(element));
    resizeObserver.observe(element);
    if (element.firstElementChild) {
      resizeObserver.observe(element.firstElementChild);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateAgentScrollEdges]);

  return (
    <aside
      data-skin-sidebar="true"
      className={`relative shrink-0 overflow-hidden bg-surface-raised ${
        isResizing ? '' : 'sidebar-transition'
      }`}
      style={{ width: isCollapsed ? 0 : sidebarWidth }}
    >
      <div
        className={`flex h-full flex-col transition-opacity ease-out ${
          isCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        style={{
          width: sidebarWidth,
          transitionDuration: `${SIDEBAR_COLLAPSE_TRANSITION_MS}ms`,
        }}
      >
      <div className="scrollbar-hidden min-h-0 max-h-[65%] shrink overflow-y-auto pb-3 pt-3">
        {showHeaderRow && (
          <div className="draggable sidebar-header-drag h-8 flex items-center justify-end px-3">
            {!isWindows && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="non-draggable h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
                aria-label={isCollapsed ? i18nService.t('expand') : i18nService.t('collapse')}
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={isCollapsed} />
              </button>
            )}
          </div>
        )}
        <div className="mt-[5px] space-y-0.5 px-3">
          <button
            type="button"
            onClick={() => {
              reportSidebarAction('new_task', { activeView, isCollapsed });
              onDestinationChange(SidebarDestination.WorkHub);
              onNewChat();
            }}
            className={`${sidebarNavItemClassName} h-9 border border-border/70 bg-surface font-medium shadow-sm`}
          >
            <ComposeIcon className={sidebarCreateIconClassName} />
            {i18nService.t('newChat')}
          </button>
          <button
            type="button"
            onClick={() => {
              reportSidebarAction('open_search', { activeView, isCollapsed });
              onDestinationChange(SidebarDestination.TaskHistory);
              onShowCowork();
              setIsSearchOpen(true);
            }}
            className={sidebarNavItemClassName}
          >
            <SidebarSearchIcon className="h-4 w-4 shrink-0" />
            {i18nService.t('search')}
          </button>
        </div>
        <nav className="mt-4 space-y-4 px-3" aria-label={i18nService.t('brandPrimaryNavigation')}>
          {SIDEBAR_NAV_GROUPS.map((group) => (
            <section key={group.id} aria-labelledby={`sidebar-group-${group.id}`}>
              <h2
                id={`sidebar-group-${group.id}`}
                className="mb-1 px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-secondary/65"
              >
                {i18nService.t(group.labelKey)}
              </h2>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = sidebarDestinationIcons[item.destination];
                  const isActive = isDestinationActive(item.destination);
                  return (
                    <button
                      key={item.destination}
                      type="button"
                      onClick={() => {
                        reportSidebarAction(`open_${item.destination}`, { activeView, isCollapsed });
                        handleSidebarDestination(item.destination);
                      }}
                      className={isActive ? activeSidebarNavItemClassName : sidebarNavItemClassName}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">{i18nService.t(item.labelKey)}</span>
                      {item.destination === SidebarDestination.MeetingRooms && hasRunningMeeting && (
                        <span
                          className="ml-auto h-2 w-2 rounded-full bg-emerald-500"
                          title={i18nService.t('meetingRunningIndicator')}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </div>
      <div className="relative min-h-0 flex-1 border-t border-border/50 pt-2">
        <div
          className="mx-3 mb-2 grid grid-cols-2 rounded-lg bg-black/[0.035] p-1 dark:bg-white/[0.055]"
          role="tablist"
          aria-label={i18nService.t('brandWorkspaceNavigation')}
        >
          {SIDEBAR_WORKSPACE_DESTINATIONS.map((item) => {
            const isActive = isDestinationActive(item.destination);
            return (
              <button
                key={item.destination}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSidebarDestination(item.destination)}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  isActive
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-secondary hover:text-foreground'
                }`}
              >
                {i18nService.t(item.labelKey)}
              </button>
            );
          })}
        </div>
        <div
          ref={agentScrollContainerRef}
          className="scrollbar-hidden h-[calc(100%_-_44px)] overflow-y-auto px-2.5 pb-10"
          onScroll={handleAgentScroll}
        >
          {activeDestination === SidebarDestination.TaskHistory
            || activeDestination === SidebarDestination.Assistants ? (
              <MyAgentSidebarTree
                displayMode={activeDestination === SidebarDestination.TaskHistory ? 'tasks' : 'assistants'}
                isBatchMode={isBatchMode}
                batchAgentId={batchAgentId}
                deletedSessionIds={deletedSessionIds}
                selectedKeys={selectedKeys}
                onShowCowork={onShowCowork}
                onTaskSelected={(params) => {
                  onDestinationChange(SidebarDestination.TaskHistory);
                  console.debug('[Sidebar] reporting agent sidebar task selection analytics');
                  void reportYdAnalyzer({
                    action: LogReporterAction.SidebarAction,
                    source: 'home_agent_sidebar',
                    actionType: 'select_task',
                    activeView,
                    ...params,
                  });
                }}
                onAgentSelected={(params) => {
                  onDestinationChange(SidebarDestination.Assistants);
                  reportSidebarAction('select_agent', {
                    source: 'home_agent_sidebar',
                    ...params,
                  });
                }}
                onSidebarAction={(actionType, params) => {
                  reportSidebarAction(actionType, {
                    source: 'home_agent_sidebar',
                    ...params,
                  });
                }}
                onToggleSelection={handleToggleSelection}
                onEnterBatchMode={handleEnterBatchMode}
                onBatchSelectableItemsChange={handleBatchSelectableItemsChange}
              />
            ) : (
              <p className="px-3 py-6 text-center text-xs text-secondary">
                {i18nService.t('brandWorkspaceHint')}
              </p>
            )}
        </div>
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-surface-raised to-transparent transition-opacity duration-150 ${
            agentScrollEdges.top ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className={`pointer-events-none absolute inset-x-0 top-[68px] z-10 h-3 bg-gradient-to-b from-surface-raised to-transparent transition-opacity duration-150 ${
            agentScrollEdges.top ? 'opacity-40' : 'opacity-0'
          }`}
        />
      </div>
      {!isCollapsed && (
        <div
          className="non-draggable absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
          onMouseDown={handleResizeStart}
        />
      )}
      <CoworkSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
      />
      {!isBatchMode && updateNotice && (
        <div className="non-draggable px-3 pt-1.5">{updateNotice}</div>
      )}
      {isBatchMode ? (
        <div className="border-t border-border/60 px-3 pb-3 pt-2">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-secondary">
              {i18nService
                .t('batchSelectionScope')
                .replace('{agent}', batchAgentName ?? '')
                .replace('{count}', String(selectedKeys.size))}
            </span>
            <button
              type="button"
              onClick={handleExitBatchMode}
              className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-secondary transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            >
              {i18nService.t('batchCancel')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 text-[length:var(--lobster-text-sidebarCompact)] font-normal text-foreground transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
              <input
                type="checkbox"
                checked={isBatchSelectAllChecked}
                onChange={handleSelectAll}
                disabled={batchSelectableItems.length === 0}
                className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 accent-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
              />
              <span className="truncate">{i18nService.t('batchSelectAll')}</span>
            </label>
            <button
              type="button"
              onClick={handleBatchDeleteClick}
              disabled={selectedKeys.size === 0}
              className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors ${
                selectedKeys.size > 0
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              }`}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              {i18nService.t('batchDelete')} ({selectedKeys.size})
            </button>
          </div>
        </div>
      ) : (
        <div className="pb-2 pt-2">
          <div className="px-3 pt-1">
            <LicenseProfileMenu
              licenseState={licenseState}
              onShowSettings={onShowSettings}
              onLogout={onLicenseLogout}
            />
          </div>
        </div>
      )}
      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteConfirm && (
        <Modal
          onClose={() => {
            reportSidebarAction('batch_delete_cancel', {
              source: 'home_agent_sidebar',
              agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
              ...getBatchSelectionSummary(),
            });
            setShowBatchDeleteConfirm(false);
          }}
          className="w-full max-w-sm mx-4 bg-surface rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-500" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              {i18nService.t('batchDeleteConfirmTitle')}
            </h2>
          </div>
          <div className="px-5 pb-4">
            <p className="text-sm text-secondary">
              {i18nService
                .t('batchDeleteConfirmMessage')
                .replace('{count}', String(selectedKeys.size))}
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
            <button
              onClick={() => {
                reportSidebarAction('batch_delete_cancel', {
                  source: 'home_agent_sidebar',
                  agentType: batchAgentId === AgentId.Main ? 'main' : 'custom',
                  ...getBatchSelectionSummary(),
                });
                setShowBatchDeleteConfirm(false);
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg text-secondary hover:bg-surface-raised transition-colors"
            >
              {i18nService.t('cancel')}
            </button>
            <button
              onClick={handleBatchDelete}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
            >
              {i18nService.t('batchDelete')} ({selectedKeys.size})
            </button>
          </div>
        </Modal>
      )}
      </div>
    </aside>
  );
};

export default Sidebar;
