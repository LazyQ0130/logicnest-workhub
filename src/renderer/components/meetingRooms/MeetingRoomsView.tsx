import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeftIcon,
  ArrowsUpDownIcon,
  PaperClipIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { ProviderRegistry } from '@shared/providers';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSelector } from 'react-redux';

import { COWORK_IMAGE_ATTACHMENT_MAX_BYTES } from '../../../shared/cowork/imageAttachments';
import {
  MeetingPauseReason,
  MeetingRoomLimits,
  MeetingRoomMode,
  type MeetingRoomMode as MeetingRoomModeType,
  MeetingRoomStatus,
  type MeetingRoomStatus as MeetingRoomStatusType,
  MeetingTurnKind,
  MeetingTurnStatus,
} from '../../../shared/meetingRoom/constants';
import type {
  MeetingRoomDto,
  MeetingRoomListItemDto,
  MeetingRoomParticipantInput,
} from '../../../shared/meetingRoom/types';
import { agentService } from '../../services/agent';
import { i18nService } from '../../services/i18n';
import { meetingRoomService } from '../../services/meetingRoom';
import { formatUserFacingError } from '../../services/userFacingError';
import type { RootState } from '../../store';
import type { Agent } from '../../types/agent';
import { getAgentDisplayName } from '../../utils/agentDisplay';
import AgentAvatarIcon from '../agent/AgentAvatarIcon';

type DraftParticipant = MeetingRoomParticipantInput & { name: string; icon: string; model: string };
type SelectedAttachment = {
  id: string;
  name: string;
  previewUrl: string;
  path?: string;
  mimeType?: string;
  base64Data?: string;
};

const buttonClass = 'inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';
const primaryButtonClass = `${buttonClass} border-foreground bg-foreground text-background hover:opacity-85`;
const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-foreground/20';

const t = (key: string) => i18nService.t(key);
const interpolate = (value: string, replacements: Record<string, string | number>) =>
  Object.entries(replacements).reduce((text, [key, replacement]) => text.replace(`{${key}}`, String(replacement)), value);

const modelSupportsVision = (modelRef: string): boolean => {
  const modelId = modelRef.includes('/') ? modelRef.slice(modelRef.lastIndexOf('/') + 1) : modelRef;
  return ProviderRegistry.getKnownModelSupportsImage(modelId) ?? false;
};

const statusLabel = (status: MeetingRoomStatusType): string => ({
  [MeetingRoomStatus.Draft]: t('meetingStatusDraft'),
  [MeetingRoomStatus.Running]: t('meetingStatusRunning'),
  [MeetingRoomStatus.Paused]: t('meetingStatusPaused'),
  [MeetingRoomStatus.Completed]: t('meetingStatusCompleted'),
  [MeetingRoomStatus.Stopped]: t('meetingStatusStopped'),
})[status];

const modeLabel = (mode: MeetingRoomModeType): string => ({
  [MeetingRoomMode.Sequential]: t('meetingModeSequential'),
  [MeetingRoomMode.ExpertPanel]: t('meetingModeExpertPanel'),
  [MeetingRoomMode.Brainstorm]: t('meetingModeBrainstorm'),
})[mode];

const turnStatusLabel = (status: string): string => ({
  [MeetingTurnStatus.Pending]: t('meetingTurnPending'),
  [MeetingTurnStatus.Running]: t('meetingTurnRunning'),
  [MeetingTurnStatus.Completed]: t('meetingTurnCompleted'),
  [MeetingTurnStatus.Interrupted]: t('meetingTurnInterrupted'),
  [MeetingTurnStatus.Failed]: t('meetingTurnFailed'),
  [MeetingTurnStatus.Skipped]: t('meetingTurnSkipped'),
})[status] ?? status;

const SortableParticipant: React.FC<{
  participant: DraftParticipant;
  onRoleNote: (agentId: string, roleNote: string) => void;
  onRemove: (agentId: string) => void;
}> = ({ participant, onRoleNote, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: participant.agentId,
  });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border border-border bg-background p-3 ${isDragging ? 'opacity-60 shadow-lg' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="cursor-grab rounded-md p-1 text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-foreground/20"
          aria-label={`${participant.name} order`}
          {...attributes}
          {...listeners}
        >
          <ArrowsUpDownIcon className="h-4 w-4" />
        </button>
        <AgentAvatarIcon value={participant.icon} className="h-8 w-8 bg-muted" iconClassName="h-4 w-4" fallbackText={participant.name[0]} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{participant.name}</div>
          <div className="truncate text-xs text-muted-foreground">{participant.model || 'Default model'}</div>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          {modelSupportsVision(participant.model) ? t('meetingVisionYes') : t('meetingVisionNo')}
        </span>
        <button type="button" className="rounded-md p-1 hover:bg-muted" onClick={() => onRemove(participant.agentId)} aria-label={t('meetingDelete')}>
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
      <label className="mt-3 block text-xs text-muted-foreground">
        {t('meetingRoleNote')}
        <textarea
          className={`${inputClass} mt-1 min-h-16 resize-y`}
          value={participant.roleNote}
          maxLength={MeetingRoomLimits.RoleNote}
          placeholder={t('meetingRoleNotePlaceholder')}
          onChange={event => onRoleNote(participant.agentId, event.target.value)}
        />
      </label>
    </div>
  );
};

export const MeetingCreateView: React.FC<{
  agents: Agent[];
  onCancel: () => void;
  onCreated: (meeting: MeetingRoomDto) => void;
}> = ({ agents, onCancel, onCreated }) => {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<MeetingRoomModeType>(MeetingRoomMode.Sequential);
  const [rounds, setRounds] = useState(1);
  const [participants, setParticipants] = useState<DraftParticipant[]>([]);
  const [attachments, setAttachments] = useState<SelectedAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const enabledAgents = useMemo(() => agents.filter(agent => agent.enabled), [agents]);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggleAgent = (agent: Agent) => {
    setParticipants(current => {
      if (current.some(participant => participant.agentId === agent.id)) {
        return current.filter(participant => participant.agentId !== agent.id);
      }
      if (current.length >= MeetingRoomLimits.ParticipantsMax) return current;
      return [...current, {
        agentId: agent.id,
        roleNote: '',
        name: getAgentDisplayName(agent),
        icon: agent.icon,
        model: agent.model,
      }];
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setParticipants(current => {
      const oldIndex = current.findIndex(item => item.agentId === active.id);
      const newIndex = current.findIndex(item => item.agentId === over.id);
      return oldIndex >= 0 && newIndex >= 0 ? arrayMove(current, oldIndex, newIndex) : current;
    });
  };

  const addAttachmentPaths = useCallback(async (paths: string[]) => {
    const available = MeetingRoomLimits.AttachmentsMax - attachments.length;
    const nextPaths = paths.slice(0, Math.max(0, available));
    const selected = await Promise.all(nextPaths.map(async filePath => {
      const read = await window.electron.dialog.readFileAsDataUrl(filePath);
      return {
        id: filePath,
        path: filePath,
        name: filePath.split(/[\\/]/).pop() || filePath,
        previewUrl: read.success && read.dataUrl ? read.dataUrl : '',
      };
    }));
    setAttachments(current => [...current, ...selected].slice(0, MeetingRoomLimits.AttachmentsMax));
  }, [attachments.length]);

  const pickImages = async () => {
    const result = await window.electron.dialog.selectFiles({
      title: t('meetingAddImages'),
      filters: [{ name: t('meetingAttachments'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    });
    if (result.success) await addAttachmentPaths(result.paths);
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    event.preventDefault();
    const supportedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
    const pasted: SelectedAttachment[] = [];
    for (const file of imageFiles.slice(0, MeetingRoomLimits.AttachmentsMax - attachments.length)) {
      if (!supportedMimeTypes.has(file.type) || file.size <= 0 || file.size > COWORK_IMAGE_ATTACHMENT_MAX_BYTES) {
        setError(t('meetingInvalidImage'));
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      pasted.push({
        id: window.crypto.randomUUID(),
        name: file.name || `meeting-image-${Date.now()}${file.type === 'image/jpeg' ? '.jpg' : `.${file.type.slice('image/'.length)}`}`,
        mimeType: file.type,
        base64Data: dataUrl.split(',')[1] ?? '',
        previewUrl: dataUrl,
      });
    }
    setAttachments(current => [...current, ...pasted].slice(0, MeetingRoomLimits.AttachmentsMax));
  };

  const submit = async () => {
    if (!topic.trim() || participants.length < MeetingRoomLimits.ParticipantsMin) return;
    setSaving(true);
    setError('');
    try {
      const meeting = await meetingRoomService.create({
        title,
        topic,
        mode,
        totalRounds: rounds,
        participants: participants.map(({ agentId, roleNote }) => ({ agentId, roleNote })),
        attachmentPaths: attachments.flatMap(attachment => attachment.path ? [attachment.path] : []),
        inlineAttachments: attachments.flatMap(attachment => (
          attachment.base64Data && attachment.mimeType
            ? [{ originalName: attachment.name, mimeType: attachment.mimeType, base64Data: attachment.base64Data }]
            : []
        )),
      });
      onCreated(meeting);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-5 py-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('meetingNew')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('meetingRoomsSubtitle')}</p>
        </div>
        <button type="button" className={buttonClass} onClick={onCancel}>{t('meetingCancel')}</button>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{formatUserFacingError(error)}</div>}
      <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
        <label className="text-sm">{t('meetingTitle')}<input className={`${inputClass} mt-1`} value={title} maxLength={MeetingRoomLimits.Title} placeholder={t('meetingTitlePlaceholder')} onChange={event => setTitle(event.target.value)} /></label>
        <label className="text-sm">{t('meetingMode')}<select className={`${inputClass} mt-1`} value={mode} onChange={event => setMode(event.target.value as MeetingRoomModeType)}><option value={MeetingRoomMode.Sequential}>{t('meetingModeSequential')}</option><option value={MeetingRoomMode.ExpertPanel}>{t('meetingModeExpertPanel')}</option><option value={MeetingRoomMode.Brainstorm}>{t('meetingModeBrainstorm')}</option></select></label>
        <label className="text-sm sm:col-span-2">{t('meetingTopic')}<textarea className={`${inputClass} mt-1 min-h-28 resize-y`} required value={topic} maxLength={MeetingRoomLimits.Topic} placeholder={t('meetingTopicPlaceholder')} onPaste={handlePaste} onChange={event => setTopic(event.target.value)} /><span className="mt-1 block text-right text-xs text-muted-foreground">{topic.length}/{MeetingRoomLimits.Topic}</span></label>
        <label className="text-sm">{t('meetingRounds')}<select className={`${inputClass} mt-1`} value={rounds} onChange={event => setRounds(Number(event.target.value))}>{[1, 2, 3].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <div className="text-sm"><span>{t('meetingAttachments')}</span><button type="button" className={`${buttonClass} mt-1 w-full gap-2`} disabled={attachments.length >= MeetingRoomLimits.AttachmentsMax} onClick={pickImages}><PaperClipIcon className="h-4 w-4" />{t('meetingAddImages')} ({attachments.length}/{MeetingRoomLimits.AttachmentsMax})</button></div>
        {attachments.length > 0 && <div className="flex gap-2 overflow-x-auto sm:col-span-2">{attachments.map(attachment => <div key={attachment.id} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">{attachment.previewUrl ? <img src={attachment.previewUrl} alt={attachment.name} className="h-full w-full object-cover" /> : <span className="p-2 text-xs">{attachment.name}</span>}<button type="button" className="absolute right-1 top-1 rounded bg-background/90 p-1" onClick={() => setAttachments(current => current.filter(item => item.id !== attachment.id))}><TrashIcon className="h-3 w-3" /></button></div>)}</div>}
      </div>
      <section className="space-y-3">
        <div><h2 className="font-medium">{t('meetingParticipants')} ({participants.length}/{MeetingRoomLimits.ParticipantsMax})</h2><p className="text-xs text-muted-foreground">{t('meetingParticipantHint')}</p></div>
        {enabledAgents.length < 2 && <p className="text-sm text-amber-600">{t('meetingNoAgents')}</p>}
        <div className="grid gap-2 sm:grid-cols-2">{enabledAgents.map(agent => { const selected = participants.some(participant => participant.agentId === agent.id); const displayName = getAgentDisplayName(agent); return <button type="button" key={agent.id} className={`flex items-center gap-2 rounded-lg border p-2 text-left text-sm ${selected ? 'border-foreground bg-muted' : 'border-border'}`} aria-pressed={selected} onClick={() => toggleAgent(agent)}><AgentAvatarIcon value={agent.icon} className="h-7 w-7" iconClassName="h-4 w-4" fallbackText={displayName[0]} /><span className="min-w-0 flex-1 truncate">{displayName}</span><span className="text-[10px] text-muted-foreground">{modelSupportsVision(agent.model) ? t('meetingVisionYes') : t('meetingVisionNo')}</span></button>; })}</div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><SortableContext items={participants.map(participant => participant.agentId)} strategy={verticalListSortingStrategy}><div className="space-y-2">{participants.map(participant => <SortableParticipant key={participant.agentId} participant={participant} onRemove={agentId => setParticipants(current => current.filter(item => item.agentId !== agentId))} onRoleNote={(agentId, roleNote) => setParticipants(current => current.map(item => item.agentId === agentId ? { ...item, roleNote } : item))} />)}</div></SortableContext></DndContext>
      </section>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur"><button type="button" className={buttonClass} onClick={onCancel}>{t('meetingCancel')}</button><button type="button" className={primaryButtonClass} disabled={saving || !topic.trim() || participants.length < 2} onClick={submit}>{saving ? t('meetingSaving') : t('meetingCreate')}</button></div>
    </div>
  );
};

const MeetingDetailView: React.FC<{
  meeting: MeetingRoomDto;
  onBack: () => void;
  onRefresh: () => void;
  onDeleted: () => void;
}> = ({ meeting, onBack, onRefresh, onDeleted }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [supplement, setSupplement] = useState('');
  const [showNoVisionConfirm, setShowNoVisionConfirm] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<'delete' | 'stop' | null>(null);
  const currentTurn = meeting.turns.find(turn => turn.id === meeting.currentTurnId);
  const currentAttempt = currentTurn?.attempts[currentTurn.attempts.length - 1];
  const turnActorName = (turn: MeetingRoomDto['turns'][number]): string => {
    if (!turn.actorParticipantId) return t('meetingHost');
    const participant = meeting.participants.find(item => item.id === turn.actorParticipantId);
    return participant
      ? getAgentDisplayName({ id: participant.agentId, name: participant.name })
      : turn.actorName;
  };
  const totalTokens = meeting.turns.reduce((total, turn) => ({ input: total.input + (turn.inputTokens ?? 0), output: total.output + (turn.outputTokens ?? 0) }), { input: 0, output: 0 });
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await operation(); onRefresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); }
  };
  const startWithVisionConfirmation = async () => {
    setBusy(true); setError('');
    try {
      await meetingRoomService.start(meeting.id);
      onRefresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (message.includes('MEETING_CONFIRM_NO_VISION')) setShowNoVisionConfirm(true);
      else setError(message);
    } finally { setBusy(false); }
  };
  const confirmNoVisionStart = async () => {
    setShowNoVisionConfirm(false);
    await act(() => meetingRoomService.start(meeting.id, true));
  };
  const runConfirmedAction = async () => {
    const action = pendingConfirmation;
    setPendingConfirmation(null);
    if (action === 'stop') await act(() => meetingRoomService.stop(meeting.id));
    if (action === 'delete') await act(async () => { await meetingRoomService.delete(meeting.id); onDeleted(); });
  };
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-5">
      {showNoVisionConfirm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-label={t('meetingNoVisionConfirm')}><div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl"><p className="text-sm leading-6">{t('meetingNoVisionConfirm')}</p><div className="mt-5 flex justify-end gap-2"><button type="button" className={buttonClass} onClick={() => setShowNoVisionConfirm(false)}>{t('meetingCancel')}</button><button type="button" className={primaryButtonClass} onClick={() => void confirmNoVisionStart()}>{t('meetingContinue')}</button></div></div></div>}
      {pendingConfirmation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-label={pendingConfirmation === 'stop' ? t('meetingStopConfirm') : t('meetingDeleteConfirm')}><div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl"><p className="text-sm leading-6">{pendingConfirmation === 'stop' ? t('meetingStopConfirm') : t('meetingDeleteConfirm')}</p><div className="mt-5 flex justify-end gap-2"><button type="button" className={buttonClass} onClick={() => setPendingConfirmation(null)}>{t('meetingCancel')}</button><button type="button" className={primaryButtonClass} onClick={() => void runConfirmedAction()}>{pendingConfirmation === 'stop' ? t('meetingStop') : t('meetingDelete')}</button></div></div></div>}
      <button type="button" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={onBack}><ArrowLeftIcon className="h-4 w-4" />{t('meetingBack')}</button>
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{formatUserFacingError(error)}</div>}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{meeting.title}</h1><span className="rounded-full bg-muted px-2 py-1 text-xs">{statusLabel(meeting.status)}</span></div><p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">{meeting.topic}</p><div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{modeLabel(meeting.mode)}</span><span>·</span><span>{interpolate(t('meetingRoundProgress'), { current: meeting.currentRound, total: meeting.totalRounds })}</span><span>·</span><span>{interpolate(t('meetingTokens'), { input: totalTokens.input, output: totalTokens.output })}</span></div></div>
        <div className="flex flex-wrap gap-2">
          {meeting.status === MeetingRoomStatus.Draft && <><button type="button" className={primaryButtonClass} disabled={busy} onClick={startWithVisionConfirmation}>{t('meetingStart')}</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setPendingConfirmation('delete')}>{t('meetingDelete')}</button></>}
          {meeting.status === MeetingRoomStatus.Running && <><button type="button" className={buttonClass} disabled={busy} onClick={() => void act(() => meetingRoomService.pause(meeting.id))}>{t('meetingPause')}</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setPendingConfirmation('stop')}>{t('meetingStop')}</button></>}
          {meeting.status === MeetingRoomStatus.Paused && <><button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void act(() => meetingRoomService.resume(meeting.id))}>{t('meetingResume')}</button>{meeting.pauseReason === MeetingPauseReason.HostFailure && <button type="button" className={buttonClass} disabled={busy} onClick={() => void act(() => meetingRoomService.retryHost(meeting.id))}>{t('meetingRetryHost')}</button>}<button type="button" className={buttonClass} disabled={busy} onClick={() => setPendingConfirmation('stop')}>{t('meetingStop')}</button></>}
          {(meeting.status === MeetingRoomStatus.Completed || meeting.status === MeetingRoomStatus.Stopped) && <><button type="button" className={buttonClass} disabled={busy} onClick={() => void act(() => meetingRoomService.exportMarkdown(meeting.id))}>{t('meetingExportMarkdown')}</button><button type="button" className={buttonClass} disabled={busy} onClick={() => void act(() => meetingRoomService.exportHtml(meeting.id))}>{t('meetingExportHtml')}</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setPendingConfirmation('delete')}>{t('meetingDelete')}</button></>}
        </div>
      </header>
      <div className="mt-4 flex flex-wrap items-center gap-2">{meeting.participants.map(participant => { const displayName = getAgentDisplayName({ id: participant.agentId, name: participant.name }); return <div key={participant.id} className="flex items-center gap-2 rounded-full border border-border px-2 py-1 text-xs"><AgentAvatarIcon value={participant.avatar} className="h-6 w-6" iconClassName="h-3.5 w-3.5" fallbackText={displayName[0]} /><span>{displayName}</span><span className="text-muted-foreground">{participant.supportsVision ? t('meetingVisionYes') : t('meetingVisionNo')}</span></div>; })}</div>
      {meeting.status === MeetingRoomStatus.Running && <div className="mt-5 rounded-xl border border-foreground/20 bg-muted/50 p-4"><div className="flex justify-between text-xs text-muted-foreground"><span>{t('meetingCurrentSpeaker')}: {currentTurn ? turnActorName(currentTurn) : t('meetingHost')}</span><span>{currentTurn ? turnStatusLabel(currentTurn.status) : ''}</span></div><div className="mt-3 whitespace-pre-wrap text-sm leading-6">{currentAttempt?.streamingContent || currentTurn?.content || '…'}</div></div>}
      <section className="mt-6"><h2 className="mb-3 font-medium">{t('meetingDiscussion')}</h2><div className="space-y-3">{meeting.turns.filter(turn => turn.kind !== MeetingTurnKind.UserSupplement).map(turn => { const latestAttempt = turn.attempts[turn.attempts.length - 1]; return <article key={turn.id} className="rounded-xl border border-border p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-medium">{turnActorName(turn)} · {turn.kind} · {turn.round}</span><span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">{turnStatusLabel(turn.status)}{turn.attempts.length > 1 ? ` · ${turn.attempts.length} attempts` : ''}</span></div>{turn.error && <p className="mb-2 text-sm text-red-500">{formatUserFacingError(turn.error)}</p>}<div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown>{turn.content || latestAttempt?.streamingContent || ''}</ReactMarkdown></div></article>; })}</div></section>
      {meeting.finalSummary && <section className="mt-6 rounded-xl border border-border bg-muted/30 p-5"><h2 className="mb-3 text-lg font-semibold">{t('meetingFinalSummary')}</h2><div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown>{meeting.finalSummary}</ReactMarkdown></div></section>}
      {meeting.status === MeetingRoomStatus.Completed && meeting.totalRounds < MeetingRoomLimits.RoundsMax && <section className="mt-6 rounded-xl border border-border p-4"><h2 className="font-medium">{t('meetingAppendRound')}</h2><textarea className={`${inputClass} mt-3 min-h-24`} maxLength={MeetingRoomLimits.Supplement} value={supplement} placeholder={t('meetingSupplementPlaceholder')} onChange={event => setSupplement(event.target.value)} /><div className="mt-3 flex justify-end"><button type="button" className={primaryButtonClass} disabled={busy || !supplement.trim()} onClick={() => void act(async () => { await meetingRoomService.appendRound({ meetingId: meeting.id, supplement }); setSupplement(''); })}>{t('meetingAppendRound')}</button></div></section>}
    </div>
  );
};

export const MeetingRoomsView: React.FC = () => {
  const agents = useSelector((state: RootState) => state.agent.agents) as Agent[];
  const [meetings, setMeetings] = useState<MeetingRoomListItemDto[]>([]);
  const [selected, setSelected] = useState<MeetingRoomDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latestEventVersions = React.useRef(new Map<string, number>());
  const selectedId = selected?.id;

  useEffect(() => {
    void agentService.loadAgents();
  }, []);

  const loadList = useCallback(async () => {
    try {
      const nextMeetings = await meetingRoomService.list();
      nextMeetings.forEach(meeting => latestEventVersions.current.set(meeting.id, meeting.version));
      setMeetings(nextMeetings);
      setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setLoading(false); }
  }, []);
  const loadSelected = useCallback(async () => {
    if (!selectedId) return;
    try {
      const nextMeeting = await meetingRoomService.get(selectedId);
      latestEventVersions.current.set(nextMeeting.id, nextMeeting.version);
      setSelected(nextMeeting);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  }, [selectedId]);
  const acceptEventVersion = useCallback((meetingId: string, version: number): boolean => {
    const latest = latestEventVersions.current.get(meetingId) ?? 0;
    if (version <= latest) return false;
    latestEventVersions.current.set(meetingId, version);
    return true;
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    const unsubscribeChanged = meetingRoomService.onChanged(event => {
      if (!acceptEventVersion(event.meetingId, event.version)) return;
      void loadList();
      if (event.meetingId === selectedId) void loadSelected();
    });
    const unsubscribeTurn = meetingRoomService.onTurnUpdate(event => {
      if (event.meetingId === selectedId && acceptEventVersion(event.meetingId, event.version)) void loadSelected();
    });
    return () => { unsubscribeChanged(); unsubscribeTurn(); };
  }, [acceptEventVersion, loadList, loadSelected, selectedId]);

  if (creating) return <div className="h-full overflow-y-auto"><MeetingCreateView agents={agents} onCancel={() => setCreating(false)} onCreated={meeting => { setCreating(false); setSelected(meeting); void loadList(); }} /></div>;
  if (selected) return <div className="h-full overflow-y-auto"><MeetingDetailView meeting={selected} onBack={() => { setSelected(null); void loadList(); }} onRefresh={() => void loadSelected()} onDeleted={() => { setSelected(null); void loadList(); }} /></div>;
  return <div className="h-full overflow-y-auto"><div className="mx-auto w-full max-w-5xl px-5 py-5"><div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">{t('meetingRoomsTitle')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('meetingRoomsSubtitle')}</p></div><button type="button" className={`${primaryButtonClass} gap-2`} onClick={() => setCreating(true)}><PlusIcon className="h-4 w-4" />{t('meetingNew')}</button></div>{error && <div role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{formatUserFacingError(error)}</div>}{loading ? <div className="py-16 text-center text-sm text-muted-foreground">{t('meetingLoading')}</div> : meetings.length === 0 ? <div className="mt-10 rounded-2xl border border-dashed border-border py-16 text-center"><UserGroupIcon className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-3 font-medium">{t('meetingEmpty')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('meetingEmptyHint')}</p></div> : <div className="mt-5 grid gap-3">{meetings.map(meeting => <button type="button" key={meeting.id} className="flex w-full items-center gap-4 rounded-xl border border-border p-4 text-left transition hover:bg-muted/50" onClick={() => void meetingRoomService.get(meeting.id).then(setSelected).catch(caught => setError(caught instanceof Error ? caught.message : String(caught)))}><div className="flex min-w-0 flex-1 flex-col gap-2"><div className="flex items-center gap-2"><span className="truncate font-medium">{meeting.title}</span><span className="rounded-full bg-muted px-2 py-1 text-[11px]">{statusLabel(meeting.status)}</span></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{modeLabel(meeting.mode)}</span><span>·</span><span>{meeting.currentRound}/{meeting.totalRounds}</span><span>·</span><span>{new Date(meeting.updatedAt).toLocaleString()}</span></div></div><div className="flex -space-x-2">{meeting.participants.map(participant => <AgentAvatarIcon key={participant.id} value={participant.avatar} className="h-8 w-8 border-2 border-background bg-muted" iconClassName="h-4 w-4" fallbackText={participant.name[0]} />)}</div></button>)}</div>}</div></div>;
};

export default MeetingRoomsView;
