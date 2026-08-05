import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  CoworkRunPolicy,
  MeetingAttemptStatus,
  MeetingPauseReason,
  MeetingRoomMode,
  MeetingRoomStatus,
  MeetingTurnKind,
  MeetingTurnStatus,
} from '../../shared/meetingRoom/constants';
import type { MeetingRoomCreateInput } from '../../shared/meetingRoom/types';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => os.tmpdir(),
  },
}));

import { DB_FILENAME } from '../appConstants';
import { CoworkStore } from '../coworkStore';
import type {
  CoworkContinueOptions,
  CoworkRuntime,
  CoworkStartOptions,
} from '../libs/agentEngine/types';
import { SqliteStore } from '../sqliteStore';
import { MeetingRoomCoordinator } from './coordinator';
import { MeetingRoomStore } from './store';

type RuntimeBehavior = 'success' | 'error' | 'tool' | 'hang';
type RuntimeCall = {
  sessionId: string;
  prompt: string;
  runPolicy: string | undefined;
  imageCount: number;
  kind: 'start' | 'continue';
};

class FakeMeetingRuntime extends EventEmitter {
  readonly calls: RuntimeCall[] = [];
  readonly stoppedSessions: string[] = [];
  behaviors: RuntimeBehavior[] = [];
  private readonly pending = new Map<string, () => void>();

  constructor(private readonly coworkStore: CoworkStore) {
    super();
  }

  startSession(sessionId: string, prompt: string, options: CoworkStartOptions): Promise<void> {
    return this.run('start', sessionId, prompt, options);
  }

  continueSession(sessionId: string, prompt: string, options: CoworkContinueOptions): Promise<void> {
    return this.run('continue', sessionId, prompt, options);
  }

  stopSession(sessionId: string): void {
    this.stoppedSessions.push(sessionId);
    this.pending.get(sessionId)?.();
    this.pending.delete(sessionId);
    this.emit('sessionStopped', sessionId);
  }

  private async run(
    kind: 'start' | 'continue',
    sessionId: string,
    prompt: string,
    options: CoworkStartOptions | CoworkContinueOptions,
  ): Promise<void> {
    const callNumber = this.calls.length + 1;
    const runId = `run-${callNumber}`;
    this.calls.push({
      sessionId,
      prompt,
      runPolicy: options.runPolicy,
      imageCount: options.imageAttachments?.length ?? 0,
      kind,
    });
    this.emit(
      'runStarted',
      sessionId,
      runId,
      options.runPolicy ?? CoworkRunPolicy.Default,
      options.meetingRunContext,
    );
    const behavior = this.behaviors.shift() ?? 'success';
    if (behavior === 'hang') {
      await new Promise<void>(resolve => this.pending.set(sessionId, resolve));
      return;
    }
    if (behavior === 'tool') {
      this.emit(
        'runPolicyViolation',
        sessionId,
        runId,
        options.runPolicy ?? CoworkRunPolicy.Default,
        'exec',
        'Tool exec is forbidden by the meeting_discussion run policy.',
        options.meetingRunContext,
      );
      throw new Error('RUN_ABORTED_AFTER_TOOL_VIOLATION');
    }
    if (behavior === 'error') throw new Error('SIMULATED_MODEL_FAILURE');
    const content = `Response ${callNumber}`;
    const message = this.coworkStore.addMessage(sessionId, {
      type: 'assistant',
      content,
      metadata: {
        isFinal: true,
        usage: { inputTokens: callNumber * 10, outputTokens: callNumber * 5 },
      },
    });
    this.emit('message', sessionId, message);
  }
}

let activeStore: SqliteStore | null = null;
let activeUserDataPath: string | null = null;
let activeSourceImage: string | null = null;
let activeManagedImage: string | null = null;

const removeKnownFile = (filePath: string): void => {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

afterEach(() => {
  if (activeManagedImage) removeKnownFile(activeManagedImage);
  const activeMeetingDir = activeManagedImage ? path.dirname(activeManagedImage) : null;
  activeManagedImage = null;
  activeStore?.close();
  activeStore = null;
  if (activeSourceImage) removeKnownFile(activeSourceImage);
  activeSourceImage = null;
  if (!activeUserDataPath) return;
  const dbPath = path.join(activeUserDataPath, DB_FILENAME);
  removeKnownFile(dbPath);
  removeKnownFile(`${dbPath}-wal`);
  removeKnownFile(`${dbPath}-shm`);
  removeKnownFile(`${dbPath}-journal`);
  const attachmentRoot = path.join(activeUserDataPath, 'meeting-attachments');
  if (activeMeetingDir && fs.existsSync(activeMeetingDir)) fs.rmdirSync(activeMeetingDir);
  if (fs.existsSync(attachmentRoot)) fs.rmdirSync(attachmentRoot);
  fs.rmdirSync(activeUserDataPath);
  activeUserDataPath = null;
});

const setup = async (defaultModel = 'deepseek-v4-flash') => {
  activeUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-room-coordinator-'));
  activeStore = await SqliteStore.create(activeUserDataPath);
  const db = activeStore.getDatabase();
  const coworkStore = new CoworkStore(db);
  coworkStore.updateAgent('main', { model: defaultModel });
  coworkStore.createAgent({
    id: 'reviewer',
    name: 'Reviewer',
    identity: 'Risk reviewer',
    systemPrompt: 'Be precise.',
    model: defaultModel,
  });
  const runtime = new FakeMeetingRuntime(coworkStore);
  let authorized = true;
  let runtimeAvailable = true;
  const meetingStore = new MeetingRoomStore(db);
  const coordinator = new MeetingRoomCoordinator({
    db,
    store: meetingStore,
    coworkStore,
    runtime: runtime as unknown as CoworkRuntime,
    attachmentRoot: path.join(activeUserDataPath, 'meeting-attachments'),
    getDefaultModel: () => defaultModel,
    isAuthorized: () => authorized,
    isRuntimeAvailable: () => runtimeAvailable,
  });
  return {
    coordinator,
    coworkStore,
    meetingStore,
    runtime,
    setAuthorized: (value: boolean) => { authorized = value; },
    setRuntimeAvailable: (value: boolean) => { runtimeAvailable = value; },
  };
};

const createInput = (attachmentPaths: string[] = []): MeetingRoomCreateInput => ({
  title: 'Coordinator test',
  topic: 'Evaluate the rollout.',
  mode: MeetingRoomMode.Sequential,
  totalRounds: 1,
  participants: [
    { agentId: 'main', roleNote: 'Lead' },
    { agentId: 'reviewer', roleNote: 'Review risks' },
  ],
  attachmentPaths,
});

const waitFor = async (predicate: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('TEST_WAIT_TIMEOUT');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

describe('meetingRoom coordinator retries and recovery', () => {
  test('retries a participant once, skips the second failure, and records every attempt', async () => {
    const { coordinator, runtime } = await setup();
    runtime.behaviors = ['success', 'error', 'success', 'error', 'error', 'success'];
    const draft = coordinator.create(createInput());
    await coordinator.start(draft.id, true);
    await waitFor(() => coordinator.get(draft.id).status === MeetingRoomStatus.Completed);

    const meeting = coordinator.get(draft.id);
    const participantTurns = meeting.turns.filter(turn => turn.kind === MeetingTurnKind.Participant);
    expect(participantTurns[0].attempts).toHaveLength(2);
    expect(participantTurns[0].status).toBe(MeetingTurnStatus.Completed);
    expect(participantTurns[1].attempts).toHaveLength(2);
    expect(participantTurns[1].status).toBe(MeetingTurnStatus.Skipped);
    expect(participantTurns[1].attempts.every(attempt => attempt.status === MeetingAttemptStatus.Failed)).toBe(true);
    expect(meeting.finalSummary).toBe('Response 6');
    expect(meeting.turns.find(turn => turn.kind === MeetingTurnKind.HostOpening)).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
    });
    expect(runtime.calls.every(call => call.runPolicy === CoworkRunPolicy.MeetingDiscussion)).toBe(true);
  });

  test('allows one plain-text host recovery after a tool violation, then pauses and supports retryHost', async () => {
    const { coordinator, runtime } = await setup();
    runtime.behaviors = ['tool', 'tool'];
    const draft = coordinator.create(createInput());
    await coordinator.start(draft.id, true);
    await waitFor(() => coordinator.get(draft.id).status === MeetingRoomStatus.Paused);

    const paused = coordinator.get(draft.id);
    const hostTurn = paused.turns.find(turn => turn.kind === MeetingTurnKind.HostOpening)!;
    expect(paused.pauseReason).toBe(MeetingPauseReason.HostFailure);
    expect(hostTurn.attempts).toHaveLength(2);
    expect(hostTurn.attempts.every(attempt => attempt.toolViolation)).toBe(true);
    expect(runtime.calls[1].prompt).toContain('Output plain text only');

    await coordinator.retryHost(draft.id);
    await waitFor(() => coordinator.get(draft.id).status === MeetingRoomStatus.Completed);
    expect(coordinator.get(draft.id).turns.find(turn => turn.id === hostTurn.id)?.attempts).toHaveLength(3);
  });

  test('interrupts without consuming retry allowance, then resumes with a new epoch and attempt', async () => {
    const { coordinator, runtime, meetingStore } = await setup();
    runtime.behaviors = ['hang'];
    const draft = coordinator.create(createInput());
    await coordinator.start(draft.id, true);
    await waitFor(() => Boolean(meetingStore.get(draft.id)?.currentAttemptId));
    const epochBeforePause = meetingStore.get(draft.id)!.runEpoch;
    await coordinator.pause(draft.id);
    expect(coordinator.get(draft.id)).toMatchObject({
      status: MeetingRoomStatus.Paused,
      pauseReason: MeetingPauseReason.User,
    });

    await coordinator.resume(draft.id);
    await waitFor(() => coordinator.get(draft.id).status === MeetingRoomStatus.Completed);
    const host = coordinator.get(draft.id).turns.find(turn => turn.kind === MeetingTurnKind.HostOpening)!;
    expect(host.attempts).toHaveLength(2);
    expect(host.attempts[0]).toMatchObject({
      status: MeetingAttemptStatus.Interrupted,
      userAborted: true,
    });
    expect(meetingStore.get(draft.id)!.runEpoch).toBe(epochBeforePause + 2);
  });

  test('drops late stream events when any meeting run identity field is stale', async () => {
    const { coordinator, runtime, meetingStore } = await setup();
    runtime.behaviors = ['hang'];
    const draft = coordinator.create(createInput());
    await coordinator.start(draft.id, true);
    await waitFor(() => Boolean(meetingStore.get(draft.id)?.currentAttemptId));
    const oldRoom = meetingStore.get(draft.id)!;
    const oldAttemptId = oldRoom.currentAttemptId!;
    const oldTurnId = oldRoom.currentTurnId!;
    const sessionId = runtime.calls[0].sessionId;
    await coordinator.pause(draft.id);

    runtime.behaviors = ['hang'];
    await coordinator.resume(draft.id);
    await waitFor(() => {
      const current = meetingStore.get(draft.id);
      return Boolean(current?.currentAttemptId && current.currentAttemptId !== oldAttemptId);
    });
    runtime.emit('meetingRunStream', sessionId, 'run-1', 'late text', {
      meetingId: draft.id,
      turnId: oldTurnId,
      attemptId: oldAttemptId,
      runEpoch: oldRoom.runEpoch,
    });
    const newAttempt = meetingStore.getAttempt(meetingStore.get(draft.id)!.currentAttemptId!);
    expect(newAttempt?.streamingContent).toBe('');
    await coordinator.stop(draft.id);
  });

  test('pauses safely when authorization or runtime availability is lost', async () => {
    const first = await setup();
    first.runtime.behaviors = ['hang'];
    const draft = first.coordinator.create(createInput());
    await first.coordinator.start(draft.id, true);
    await waitFor(() => Boolean(first.meetingStore.get(draft.id)?.currentAttemptId));
    first.setAuthorized(false);
    await first.coordinator.pauseForAuthorizationLoss();
    expect(first.coordinator.get(draft.id).pauseReason).toBe(MeetingPauseReason.AuthorizationLost);
  });
});

describe('meetingRoom coordinator images and deletion', () => {
  test('requires confirmation for all non-vision models and sends only the explicit degradation notice', async () => {
    const { coordinator, runtime, meetingStore } = await setup('deepseek-v4-flash');
    activeSourceImage = path.join(os.tmpdir(), `meeting-source-${process.pid}-${Date.now()}.png`);
    fs.writeFileSync(activeSourceImage, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 72, 68, 82]), { flag: 'wx' });
    const draft = coordinator.create(createInput([activeSourceImage]));
    activeManagedImage = meetingStore.listAttachments(draft.id)[0].managedPath;
    await expect(coordinator.start(draft.id)).rejects.toThrow('MEETING_CONFIRM_NO_VISION');
    await coordinator.start(draft.id, true);
    await waitFor(() => coordinator.get(draft.id).status === MeetingRoomStatus.Completed);
    expect(runtime.calls.every(call => call.imageCount === 0)).toBe(true);
    expect(runtime.calls.some(call => call.prompt.includes('不得猜测图片内容'))).toBe(true);
    expect(coordinator.get(draft.id).attachments).toHaveLength(1);
  });

  test('passes a managed image only on the first call of each vision-capable hidden session', async () => {
    const { coordinator, runtime, meetingStore } = await setup('gpt-5-mini');
    activeSourceImage = path.join(os.tmpdir(), `meeting-vision-${process.pid}-${Date.now()}.png`);
    fs.writeFileSync(activeSourceImage, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 72, 68, 82]), { flag: 'wx' });
    const draft = coordinator.create(createInput([activeSourceImage]));
    activeManagedImage = meetingStore.listAttachments(draft.id)[0].managedPath;
    await coordinator.start(draft.id);
    await waitFor(() => coordinator.get(draft.id).status === MeetingRoomStatus.Completed);
    const starts = runtime.calls.filter(call => call.kind === 'start');
    const continues = runtime.calls.filter(call => call.kind === 'continue');
    expect(starts).toHaveLength(3);
    expect(starts.every(call => call.imageCount === 1)).toBe(true);
    expect(continues.every(call => call.imageCount === 0)).toBe(true);
  });

  test('invalidates a running meeting before deleting hidden sessions, attachment file, and rows', async () => {
    const { coordinator, runtime, coworkStore, meetingStore } = await setup();
    activeSourceImage = path.join(os.tmpdir(), `meeting-delete-${process.pid}-${Date.now()}.png`);
    fs.writeFileSync(activeSourceImage, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 72, 68, 82]), { flag: 'wx' });
    runtime.behaviors = ['hang'];
    const draft = coordinator.create(createInput([activeSourceImage]));
    const managedPath = meetingStore.listAttachments(draft.id)[0].managedPath;
    activeManagedImage = managedPath;
    await coordinator.start(draft.id, true);
    await waitFor(() => Boolean(meetingStore.get(draft.id)?.currentAttemptId));
    const hiddenIds = meetingStore.listHiddenSessionIds(draft.id);
    await coordinator.delete(draft.id);
    expect(meetingStore.get(draft.id)).toBeNull();
    expect(fs.existsSync(managedPath)).toBe(false);
    expect(hiddenIds.every(sessionId => coworkStore.getSession(sessionId) === null)).toBe(true);
    expect(runtime.stoppedSessions.length).toBeGreaterThan(0);
  });
});
