import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

import { AgentId, DefaultAgentProfile, LegacyAgentName } from '../../shared/agent';
import { BRAND } from '../../shared/brand';
import type { CoworkImageAttachmentPayload } from '../../shared/cowork/imageAttachments';
import {
  CoworkRunPolicy,
  CoworkSessionScope,
  MeetingPauseReason,
  type MeetingPauseReason as MeetingPauseReasonType,
  MeetingRoomLimits,
  MeetingRoomStatus,
  MeetingTurnKind,
  MeetingTurnStatus,
} from '../../shared/meetingRoom/constants';
import type {
  MeetingRoomChangedEvent,
  MeetingRoomCreateInput,
  MeetingRoomDto,
  MeetingRoomListItemDto,
  MeetingRoomTurnUpdateEvent,
} from '../../shared/meetingRoom/types';
import type { Agent, CoworkMessage, CoworkStore } from '../coworkStore';
import type { CoworkRuntime, MeetingRunContext } from '../libs/agentEngine/types';
import { meetingModelSupportsVision } from './modelCapabilities';
import {
  buildHostSystemPrompt,
  buildParticipantSystemPrompt,
  buildPromptForTurn,
} from './prompts';
import {
  isMeetingHostTurn,
  shouldRetryHostToolViolation,
  shouldRetryParticipantTurn,
} from './stateMachine';
import type {
  MeetingAttemptRecord,
  MeetingParticipantSnapshot,
  MeetingRoomRecord,
  MeetingTurnRecord,
} from './store';
import { MeetingRoomStore } from './store';
import {
  validateMeetingAttachment,
  validateMeetingCreateInput,
  validateMeetingId,
  validateMeetingInlineAttachment,
  validateMeetingSupplement,
} from './validation';

type ActiveRunContext = {
  meetingId: string;
  turnId: string;
  attemptId: string;
  runEpoch: number;
  sessionId: string;
  openClawRunId: string | null;
  content: string;
  toolViolation: { toolName: string; reason: string } | null;
};

const meetingAgentSnapshotName = (agent: Agent): string => {
  if (agent.id !== AgentId.Main) return agent.name;
  const normalized = agent.name.trim().toLowerCase();
  return !normalized
    || normalized === LegacyAgentName.Main
    || normalized === DefaultAgentProfile.Name.toLowerCase()
    ? BRAND.mainAgentNameEn
    : agent.name;
};

export interface MeetingRoomCoordinatorDeps {
  db: Database.Database;
  store: MeetingRoomStore;
  coworkStore: CoworkStore;
  runtime: CoworkRuntime;
  attachmentRoot: string;
  getDefaultModel: () => string;
  isAuthorized: () => boolean;
  isRuntimeAvailable: () => boolean;
}

export class MeetingRoomCoordinator extends EventEmitter {
  private readonly activeBySession = new Map<string, ActiveRunContext>();
  private readonly commandQueues = new Map<string, Promise<unknown>>();
  private readonly scheduledMeetings = new Set<string>();

  constructor(private readonly deps: MeetingRoomCoordinatorDeps) {
    super();
    this.bindRuntimeEvents();
  }

  list(): MeetingRoomListItemDto[] {
    return this.deps.store.list();
  }

  get(meetingId: string): MeetingRoomDto {
    const dto = this.deps.store.getDto(validateMeetingId(meetingId));
    if (!dto) throw new Error('MEETING_NOT_FOUND');
    return dto;
  }

  create(value: unknown): MeetingRoomDto {
    const input = validateMeetingCreateInput(value);
    const agents = this.resolveDraftAgents(input);
    const meetingId = randomUUID();
    const meetingAttachmentDir = path.resolve(this.deps.attachmentRoot, meetingId);
    const copiedPaths: string[] = [];
    try {
      const pathAttachments = (input.attachmentPaths ?? []).map(filePath => {
        const source = validateMeetingAttachment(filePath);
        return { source, buffer: null as Buffer | null };
      });
      const inlineAttachments = (input.inlineAttachments ?? []).map(attachment => {
        const source = validateMeetingInlineAttachment(attachment);
        return { source, buffer: source.buffer as Buffer | null };
      });
      const attachments = [...pathAttachments, ...inlineAttachments].map(({ source, buffer }, index) => {
        fs.mkdirSync(meetingAttachmentDir, { recursive: true });
        const managedPath = path.resolve(
          meetingAttachmentDir,
          `${String(index + 1).padStart(2, '0')}-${randomUUID()}${source.extension}`,
        );
        if (!managedPath.startsWith(`${meetingAttachmentDir}${path.sep}`)) {
          throw new Error('MEETING_INVALID_MANAGED_PATH');
        }
        if (buffer) fs.writeFileSync(managedPath, buffer, { flag: 'wx' });
        else fs.copyFileSync(source.sourcePath, managedPath, fs.constants.COPYFILE_EXCL);
        copiedPaths.push(managedPath);
        return {
          originalName: source.originalName,
          mimeType: source.mimeType,
          managedPath,
          sizeBytes: source.sizeBytes,
        };
      });
      return this.deps.store.createDraft({
        id: meetingId,
        title: input.title!,
        topic: input.topic,
        mode: input.mode,
        totalRounds: input.totalRounds,
        participants: agents.map(({ agent, roleNote }) => ({
          agentId: agent.id,
          roleNote,
          name: meetingAgentSnapshotName(agent),
          avatar: agent.icon,
          model: agent.model,
          supportsVision: meetingModelSupportsVision(agent.model || this.deps.getDefaultModel()),
          identity: agent.identity,
          systemPrompt: agent.systemPrompt,
        })),
        attachments,
      });
    } catch (error) {
      copiedPaths.forEach(filePath => this.deleteFile(filePath));
      throw error;
    }
  }

  async start(meetingIdValue: unknown, confirmNoVision = false): Promise<MeetingRoomDto> {
    const meetingId = validateMeetingId(meetingIdValue);
    await this.enqueue(meetingId, async () => {
      this.assertCanRun();
      const room = this.requireRoom(meetingId);
      if (room.status === MeetingRoomStatus.Running) return;
      if (room.status !== MeetingRoomStatus.Draft) throw new Error('MEETING_NOT_DRAFT');
      const participants = this.resolveStartParticipants(meetingId);
      const defaultModel = this.deps.getDefaultModel().trim();
      if (!defaultModel) throw new Error('MEETING_DEFAULT_MODEL_MISSING');
      const hostSupportsVision = meetingModelSupportsVision(defaultModel);
      if (!confirmNoVision && !hostSupportsVision && participants.every(participant => !participant.supportsVision)) {
        throw new Error('MEETING_CONFIRM_NO_VISION');
      }

      this.deps.db.transaction(() => {
        const hostSession = this.deps.coworkStore.createSession(
          `[Meeting host] ${room.title}`,
          this.deps.coworkStore.getConfig().workingDirectory,
          buildHostSystemPrompt(),
          'local',
          [],
          'main',
          defaultModel,
          CoworkSessionScope.MeetingHidden,
        );
        const frozenParticipants = participants.map(participant => {
          const hiddenSession = this.deps.coworkStore.createSession(
            `[Meeting participant] ${participant.name}`,
            this.deps.coworkStore.getConfig().workingDirectory,
            buildParticipantSystemPrompt(participant),
            'local',
            [],
            participant.agentId,
            participant.model,
            CoworkSessionScope.MeetingHidden,
          );
          return { ...participant, hiddenSessionId: hiddenSession.id };
        });
        this.deps.store.freezeForStart({
          meetingId,
          hostSessionId: hostSession.id,
          hostModel: defaultModel,
          hostSupportsVision,
          participants: frozenParticipants,
        });
      })();
      this.emitChanged(meetingId);
    });
    this.schedule(meetingId);
    return this.get(meetingId);
  }

  async pause(meetingIdValue: unknown, reason: MeetingPauseReasonType = MeetingPauseReason.User): Promise<MeetingRoomDto> {
    const meetingId = validateMeetingId(meetingIdValue);
    await this.enqueue(meetingId, async () => {
      const room = this.requireRoom(meetingId);
      if (room.status === MeetingRoomStatus.Paused) return;
      if (room.status !== MeetingRoomStatus.Running) throw new Error('MEETING_NOT_RUNNING');
      const sessionId = this.getActiveSessionId(room);
      this.deps.store.pause(meetingId, reason, reason === MeetingPauseReason.User);
      if (sessionId) this.deps.runtime.stopSession(sessionId);
      this.emitChanged(meetingId);
    });
    return this.get(meetingId);
  }

  async resume(meetingIdValue: unknown): Promise<MeetingRoomDto> {
    const meetingId = validateMeetingId(meetingIdValue);
    await this.enqueue(meetingId, async () => {
      this.assertCanRun();
      this.deps.store.resume(meetingId);
      this.emitChanged(meetingId);
    });
    this.schedule(meetingId);
    return this.get(meetingId);
  }

  async stop(meetingIdValue: unknown): Promise<MeetingRoomDto> {
    const meetingId = validateMeetingId(meetingIdValue);
    await this.enqueue(meetingId, async () => {
      const room = this.requireRoom(meetingId);
      if (room.status === MeetingRoomStatus.Stopped) return;
      const sessionId = this.getActiveSessionId(room);
      this.deps.store.stop(meetingId);
      if (sessionId) this.deps.runtime.stopSession(sessionId);
      this.emitChanged(meetingId);
    });
    return this.get(meetingId);
  }

  async appendRound(meetingIdValue: unknown, supplementValue: unknown): Promise<MeetingRoomDto> {
    const meetingId = validateMeetingId(meetingIdValue);
    const supplement = validateMeetingSupplement(supplementValue);
    await this.enqueue(meetingId, async () => {
      this.assertCanRun();
      this.deps.store.appendRound(meetingId, supplement);
      this.emitChanged(meetingId);
    });
    this.schedule(meetingId);
    return this.get(meetingId);
  }

  async retryHost(meetingIdValue: unknown): Promise<MeetingRoomDto> {
    const meetingId = validateMeetingId(meetingIdValue);
    await this.enqueue(meetingId, async () => {
      this.assertCanRun();
      const room = this.requireRoom(meetingId);
      if (room.status !== MeetingRoomStatus.Paused || room.pauseReason !== MeetingPauseReason.HostFailure) {
        throw new Error('MEETING_HOST_RETRY_NOT_ALLOWED');
      }
      const failedHostTurn = this.deps.store.listTurns(meetingId)
        .find(turn => isMeetingHostTurn(turn) && turn.status === MeetingTurnStatus.Failed);
      if (!failedHostTurn) throw new Error('MEETING_FAILED_HOST_TURN_NOT_FOUND');
      this.deps.store.resetTurnForRetry(failedHostTurn.id);
      this.deps.store.resume(meetingId);
      this.emitChanged(meetingId);
    });
    this.schedule(meetingId);
    return this.get(meetingId);
  }

  async delete(meetingIdValue: unknown): Promise<void> {
    const meetingId = validateMeetingId(meetingIdValue);
    await this.enqueue(meetingId, async () => {
      const room = this.requireRoom(meetingId);
      const sessionId = this.getActiveSessionId(room);
      this.deps.store.invalidateForDelete(meetingId);
      if (sessionId) this.deps.runtime.stopSession(sessionId);
      const hiddenSessionIds = this.deps.store.listHiddenSessionIds(meetingId);
      const attachments = this.deps.store.listAttachments(meetingId);
      for (const hiddenSessionId of hiddenSessionIds) {
        this.deps.runtime.onSessionDeleted?.(hiddenSessionId);
        this.deps.coworkStore.deleteSession(hiddenSessionId);
      }
      for (const attachment of attachments) this.deleteFile(attachment.managedPath);
      this.deps.store.deleteRows(meetingId);
      this.emit('changed', {
        meetingId,
        status: MeetingRoomStatus.Stopped,
        version: room.version + 1,
      } satisfies MeetingRoomChangedEvent);
    });
  }

  async pauseForAuthorizationLoss(): Promise<void> {
    const running = this.deps.store.list().find(room => room.status === MeetingRoomStatus.Running);
    if (running) await this.pause(running.id, MeetingPauseReason.AuthorizationLost);
  }

  async pauseForRuntimeUnavailable(): Promise<void> {
    const running = this.deps.store.list().find(room => room.status === MeetingRoomStatus.Running);
    if (running) await this.pause(running.id, MeetingPauseReason.RuntimeUnavailable);
  }

  private schedule(meetingId: string): void {
    if (this.scheduledMeetings.has(meetingId)) return;
    this.scheduledMeetings.add(meetingId);
    void this.runMeeting(meetingId).finally(() => this.scheduledMeetings.delete(meetingId));
  }

  private async runMeeting(meetingId: string): Promise<void> {
    while (true) {
      const room = this.deps.store.get(meetingId);
      if (!room || room.status !== MeetingRoomStatus.Running) return;
      if (!this.deps.isAuthorized()) {
        await this.pause(meetingId, MeetingPauseReason.AuthorizationLost);
        return;
      }
      if (!this.deps.isRuntimeAvailable()) {
        await this.pause(meetingId, MeetingPauseReason.RuntimeUnavailable);
        return;
      }
      const turn = this.deps.store.getNextTurn(meetingId);
      if (!turn) {
        this.deps.store.markCompleted(meetingId);
        this.emitChanged(meetingId);
        return;
      }
      if (turn.kind === MeetingTurnKind.UserSupplement) {
        this.deps.store.resetTurnForRetry(turn.id);
        continue;
      }
      await this.runTurn(room, turn);
    }
  }

  private async runTurn(room: MeetingRoomRecord, turn: MeetingTurnRecord): Promise<void> {
    const participants = this.deps.store.listParticipants(room.id);
    const participant = turn.actorParticipantId
      ? participants.find(candidate => candidate.id === turn.actorParticipantId)
      : null;
    const sessionId = participant?.hiddenSessionId ?? room.hostSessionId;
    if (!sessionId) throw new Error('MEETING_HIDDEN_SESSION_MISSING');
    const supportsVision = participant?.supportsVision ?? room.hostSupportsVision;
    const attachments = this.deps.store.listAttachments(room.id);
    const hasUnavailableImages = attachments.length > 0 && !supportsVision;
    const prompt = buildPromptForTurn({
      room,
      turn,
      turns: this.deps.store.listTurns(room.id),
      participants,
      hasUnavailableImages,
    });
    const attempt = this.deps.store.beginAttempt(room.id, turn.id);
    const context: ActiveRunContext = {
      meetingId: room.id,
      turnId: turn.id,
      attemptId: attempt.id,
      runEpoch: attempt.runEpoch,
      sessionId,
      openClawRunId: null,
      content: '',
      toolViolation: null,
    };
    const meetingRunContext: MeetingRunContext = {
      meetingId: room.id,
      turnId: turn.id,
      attemptId: attempt.id,
      runEpoch: attempt.runEpoch,
    };
    this.activeBySession.set(sessionId, context);
    this.emitTurn(room.id, turn.id, attempt.id);

    const coworkSession = this.deps.coworkStore.getSession(sessionId, 0);
    if (!coworkSession) throw new Error('MEETING_HIDDEN_SESSION_NOT_FOUND');
    const imageAttachments = supportsVision && coworkSession.totalMessages === 0
      ? this.readImageAttachments(attachments)
      : undefined;
    const systemPrompt = participant
      ? buildParticipantSystemPrompt(participant)
      : buildHostSystemPrompt();
    const strictRecoveryPrompt = attempt.attemptNumber > 1
      ? `${prompt}\n\nPrevious attempt failed. Output plain text only. Any tool call will fail this turn.`
      : prompt;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    const timeout = new Promise<void>(resolve => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        this.deps.runtime.stopSession(sessionId);
        resolve();
      }, MeetingRoomLimits.TurnTimeoutMs);
    });
    try {
      const run = coworkSession.totalMessages === 0
        ? this.deps.runtime.startSession(sessionId, strictRecoveryPrompt, {
            agentId: 'main',
            systemPrompt,
            skillIds: [],
            messageSkillIds: [],
            kitIds: [],
            imageAttachments,
            confirmationMode: 'text',
            runPolicy: CoworkRunPolicy.MeetingDiscussion,
            meetingRunContext,
          })
        : this.deps.runtime.continueSession(sessionId, strictRecoveryPrompt, {
            systemPrompt,
            skillIds: [],
            messageSkillIds: [],
            kitIds: [],
            imageAttachments,
            runPolicy: CoworkRunPolicy.MeetingDiscussion,
            meetingRunContext,
          });
      await Promise.race([run, timeout]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const latestRoom = this.deps.store.get(room.id);
      if (!latestRoom || latestRoom.status !== MeetingRoomStatus.Running
        || latestRoom.runEpoch !== attempt.runEpoch
        || latestRoom.currentAttemptId !== attempt.id) return;

      if (timedOut) {
        await this.handleTurnFailure(room, turn, attempt, 'MEETING_TURN_TIMEOUT', { timeout: true });
        return;
      }
      if (context.toolViolation) {
        await this.handleTurnFailure(room, turn, attempt, context.toolViolation.reason, {
          toolViolation: true,
          toolName: context.toolViolation.toolName,
        });
        return;
      }
      const finalResponse = this.resolveFinalAssistantContent(sessionId, context.content);
      if (!finalResponse.content.trim()) {
        await this.handleTurnFailure(room, turn, attempt, 'MEETING_EMPTY_RESPONSE');
        return;
      }
      this.deps.store.completeAttempt({
        meetingId: room.id,
        turnId: turn.id,
        attemptId: attempt.id,
        runEpoch: attempt.runEpoch,
        content: finalResponse.content,
        inputTokens: finalResponse.inputTokens,
        outputTokens: finalResponse.outputTokens,
      });
      this.emitTurn(room.id, turn.id, attempt.id);
      this.emitChanged(room.id);
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const message = error instanceof Error ? error.message : String(error);
      const latest = this.deps.store.get(room.id);
      if (latest?.status === MeetingRoomStatus.Running
        && latest.runEpoch === attempt.runEpoch
        && latest.currentAttemptId === attempt.id) {
        if (context.toolViolation) {
          await this.handleTurnFailure(room, turn, attempt, context.toolViolation.reason, {
            toolViolation: true,
            toolName: context.toolViolation.toolName,
          });
        } else {
          await this.handleTurnFailure(room, turn, attempt, message);
        }
      }
    } finally {
      if (this.activeBySession.get(sessionId) === context) this.activeBySession.delete(sessionId);
    }
  }

  private async handleTurnFailure(
    room: MeetingRoomRecord,
    turn: MeetingTurnRecord,
    attempt: MeetingAttemptRecord,
    error: string,
    details: { toolViolation?: boolean; toolName?: string; timeout?: boolean } = {},
  ): Promise<void> {
    const failedCount = this.deps.store.countFailedAttempts(turn.id) + 1;
    const host = isMeetingHostTurn(turn);
    const retry = host
      ? Boolean(details.toolViolation && shouldRetryHostToolViolation(failedCount))
      : shouldRetryParticipantTurn(failedCount);
    this.deps.store.failAttempt({
      meetingId: room.id,
      turnId: turn.id,
      attemptId: attempt.id,
      runEpoch: attempt.runEpoch,
      error,
      skipped: !host && !retry,
      toolViolation: details.toolViolation,
      toolName: details.toolName,
      timeout: details.timeout,
    });
    this.emitTurn(room.id, turn.id, attempt.id);
    if (retry) {
      this.deps.store.resetTurnForRetry(turn.id);
      this.emitChanged(room.id);
      return;
    }
    if (host) {
      this.deps.store.pause(room.id, MeetingPauseReason.HostFailure, false);
    }
    this.emitChanged(room.id);
  }

  private bindRuntimeEvents(): void {
    this.deps.runtime.on('runStarted', (sessionId, runId, runPolicy, meetingContext) => {
      if (runPolicy !== CoworkRunPolicy.MeetingDiscussion || !meetingContext) return;
      const active = this.activeBySession.get(sessionId);
      if (!active || !this.matchesRunContext(active, meetingContext)) return;
      active.openClawRunId = runId;
      this.deps.store.bindAttemptRun(
        active.meetingId,
        active.turnId,
        active.attemptId,
        active.runEpoch,
        runId,
      );
    });
    this.deps.runtime.on('meetingRunStream', (sessionId, runId, content, meetingContext) => {
      this.acceptStream(sessionId, runId, content, meetingContext);
    });
    this.deps.runtime.on('runPolicyViolation', (sessionId, runId, runPolicy, toolName, reason, meetingContext) => {
      if (runPolicy !== CoworkRunPolicy.MeetingDiscussion || !meetingContext) return;
      const active = this.activeBySession.get(sessionId);
      if (!active || !this.matchesRunContext(active, meetingContext) || active.openClawRunId !== runId) return;
      active.toolViolation = { toolName, reason };
    });
  }

  private acceptStream(
    sessionId: string,
    runId: string,
    content: string,
    meetingContext: MeetingRunContext,
  ): void {
    const active = this.activeBySession.get(sessionId);
    if (!active || !this.matchesRunContext(active, meetingContext) || active.openClawRunId !== runId) return;
    active.content = content;
    const accepted = this.deps.store.updateAttemptStream({
      meetingId: active.meetingId,
      turnId: active.turnId,
      attemptId: active.attemptId,
      runEpoch: active.runEpoch,
      runId,
      content,
    });
    if (accepted) this.emitTurn(active.meetingId, active.turnId, active.attemptId);
  }

  private matchesRunContext(active: ActiveRunContext, context: MeetingRunContext): boolean {
    return active.meetingId === context.meetingId
      && active.turnId === context.turnId
      && active.attemptId === context.attemptId
      && active.runEpoch === context.runEpoch;
  }

  private resolveDraftAgents(input: MeetingRoomCreateInput): Array<{ agent: Agent; roleNote: string }> {
    return input.participants.map(participant => {
      const agent = this.deps.coworkStore.getAgent(participant.agentId);
      if (!agent || !agent.enabled) throw new Error('MEETING_AGENT_UNAVAILABLE');
      return { agent, roleNote: participant.roleNote };
    });
  }

  private resolveStartParticipants(meetingId: string): MeetingParticipantSnapshot[] {
    return this.deps.store.listParticipants(meetingId).map((snapshot): MeetingParticipantSnapshot => {
      const agent = this.deps.coworkStore.getAgent(snapshot.agentId);
      if (!agent || !agent.enabled) throw new Error('MEETING_AGENT_UNAVAILABLE');
      const model = agent.model.trim() || this.deps.getDefaultModel().trim();
      return {
        ...snapshot,
        name: meetingAgentSnapshotName(agent),
        avatar: agent.icon,
        model,
        supportsVision: meetingModelSupportsVision(model),
        identity: agent.identity,
        systemPrompt: agent.systemPrompt,
        hiddenSessionId: null,
      };
    });
  }

  private readImageAttachments(attachments: ReturnType<MeetingRoomStore['listAttachments']>): CoworkImageAttachmentPayload[] {
    return attachments.map(attachment => ({
      name: attachment.originalName,
      mimeType: attachment.mimeType,
      base64Data: fs.readFileSync(attachment.managedPath).toString('base64'),
      sizeBytes: attachment.sizeBytes,
      localPath: attachment.managedPath,
    }));
  }

  private resolveFinalAssistantContent(
    sessionId: string,
    streamingFallback: string,
  ): { content: string; inputTokens: number | null; outputTokens: number | null } {
    const session = this.deps.coworkStore.getSession(sessionId, 100);
    const assistant = [...(session?.messages ?? [])]
      .reverse()
      .find((message: CoworkMessage) => message.type === 'assistant' && !message.metadata?.isThinking);
    return {
      content: assistant?.content.trim() || streamingFallback.trim(),
      inputTokens: assistant?.metadata?.usage?.inputTokens ?? null,
      outputTokens: assistant?.metadata?.usage?.outputTokens ?? null,
    };
  }

  private getActiveSessionId(room: MeetingRoomRecord): string | null {
    if (!room.currentAttemptId) return null;
    for (const active of this.activeBySession.values()) {
      if (active.meetingId === room.id && active.attemptId === room.currentAttemptId) return active.sessionId;
    }
    return null;
  }

  private assertCanRun(): void {
    if (!this.deps.isAuthorized()) throw new Error('MEETING_AUTHORIZATION_REQUIRED');
    if (!this.deps.isRuntimeAvailable()) throw new Error('MEETING_RUNTIME_UNAVAILABLE');
  }

  private requireRoom(meetingId: string): MeetingRoomRecord {
    const room = this.deps.store.get(meetingId);
    if (!room) throw new Error('MEETING_NOT_FOUND');
    return room;
  }

  private emitChanged(meetingId: string): void {
    const room = this.deps.store.get(meetingId);
    if (!room) return;
    this.emit('changed', {
      meetingId,
      status: room.status,
      version: room.version,
    } satisfies MeetingRoomChangedEvent);
  }

  private emitTurn(meetingId: string, turnId: string, attemptId: string): void {
    const dto = this.deps.store.getDto(meetingId);
    const turn = dto?.turns.find(candidate => candidate.id === turnId);
    const attempt = turn?.attempts.find(candidate => candidate.id === attemptId);
    if (!dto || !turn || !attempt) return;
    this.emit('turnUpdate', {
      meetingId,
      turnId,
      attemptId,
      status: turn.status,
      content: attempt.streamingContent || turn.content,
      version: dto.version,
    } satisfies MeetingRoomTurnUpdateEvent);
  }

  private enqueue<T>(meetingId: string, operation: () => Promise<T> | T): Promise<T> {
    const previous = this.commandQueues.get(meetingId) ?? Promise.resolve();
    const next: Promise<T> = previous
      .catch((_error: unknown): void => undefined)
      .then((): Promise<T> | T => operation());
    this.commandQueues.set(meetingId, next);
    return next.finally(() => {
      if (this.commandQueues.get(meetingId) === next) this.commandQueues.delete(meetingId);
    });
  }

  private deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
      console.warn('[MeetingRoom] failed to delete managed attachment:', filePath, error);
    }
  }
}
