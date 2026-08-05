import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  CoworkSessionScope,
  MeetingPauseReason,
  MeetingRoomMode,
  MeetingRoomStatus,
  MeetingTurnKind,
  MeetingTurnStatus,
} from '../../shared/meetingRoom/constants';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => os.tmpdir(),
  },
}));

import { DB_FILENAME } from '../appConstants';
import { CoworkStore } from '../coworkStore';
import { SqliteStore } from '../sqliteStore';
import { MeetingRoomStore } from './store';

let activeStore: SqliteStore | null = null;
let activeUserDataPath: string | null = null;

const removeKnownDatabaseFile = (filePath: string): void => {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

afterEach(() => {
  activeStore?.close();
  activeStore = null;
  if (!activeUserDataPath) return;
  const dbPath = path.join(activeUserDataPath, DB_FILENAME);
  removeKnownDatabaseFile(dbPath);
  removeKnownDatabaseFile(`${dbPath}-wal`);
  removeKnownDatabaseFile(`${dbPath}-shm`);
  removeKnownDatabaseFile(`${dbPath}-journal`);
  fs.rmdirSync(activeUserDataPath);
  activeUserDataPath = null;
});

const createFreshStore = async (): Promise<SqliteStore> => {
  activeUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-room-store-'));
  activeStore = await SqliteStore.create(activeUserDataPath);
  return activeStore;
};

const createDraft = (
  store: MeetingRoomStore,
  rounds = 2,
  mode = MeetingRoomMode.Sequential,
): string => {
  const id = randomUUID();
  store.createDraft({
    id,
    title: 'Architecture review',
    topic: 'Choose a safe rollout plan.',
    mode,
    totalRounds: rounds,
    participants: [
      {
        agentId: 'main',
        roleNote: 'Challenge assumptions',
        name: 'Main',
        avatar: '',
        model: 'model-a',
        supportsVision: true,
        identity: 'Main identity',
        systemPrompt: 'Main prompt',
      },
      {
        agentId: 'reviewer',
        roleNote: 'Review risks',
        name: 'Reviewer',
        avatar: '',
        model: 'model-b',
        supportsVision: false,
        identity: 'Reviewer identity',
        systemPrompt: 'Reviewer prompt',
      },
    ],
    attachments: [{
      originalName: 'diagram.png',
      mimeType: 'image/png',
      managedPath: path.join(os.tmpdir(), `${id}.png`),
      sizeBytes: 128,
    }],
  });
  return id;
};

const freezeDraft = (store: MeetingRoomStore, meetingId: string): void => {
  const participants = store.listParticipants(meetingId).map(participant => ({
    ...participant,
    hiddenSessionId: randomUUID(),
  }));
  store.freezeForStart({
    meetingId,
    hostSessionId: randomUUID(),
    hostModel: 'host-model',
    hostSupportsVision: true,
    participants,
  });
};

describe('meetingRoom migration and hidden session scope', () => {
  test('initializes the complete meeting schema and user scope default', async () => {
    const sqlite = await createFreshStore();
    const db = sqlite.getDatabase();
    const tableNames = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'meeting_%' ORDER BY name
    `).all() as Array<{ name: string }>;
    expect(tableNames.map(row => row.name)).toEqual([
      'meeting_attachments',
      'meeting_participants',
      'meeting_rooms',
      'meeting_turn_attempts',
      'meeting_turns',
    ]);
    const scope = db.prepare(`PRAGMA table_info('cowork_sessions')`).all()
      .find((column: unknown) => (column as { name: string }).name === 'scope') as { dflt_value: string };
    expect(scope.dflt_value).toBe("'user'");
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  test('migrates a legacy cowork_sessions table without rebuilding it', async () => {
    activeUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-room-legacy-'));
    const dbPath = path.join(activeUserDataPath, DB_FILENAME);
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE cowork_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        claude_session_id TEXT,
        status TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        pin_order INTEGER,
        cwd TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        model_override TEXT NOT NULL DEFAULT '',
        execution_mode TEXT NOT NULL DEFAULT 'local',
        active_skill_ids TEXT NOT NULL DEFAULT '[]',
        agent_id TEXT NOT NULL DEFAULT 'main',
        parent_session_id TEXT,
        forked_from_message_id TEXT,
        forked_at INTEGER,
        fork_mode TEXT,
        fork_workspace_path TEXT,
        fork_git_branch TEXT,
        fork_git_base_ref TEXT,
        goal_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO cowork_sessions (
        id, title, status, cwd, system_prompt, created_at, updated_at
      ) VALUES ('legacy-session', 'Legacy', 'idle', '', '', 1, 1);
    `);
    legacy.close();

    activeStore = await SqliteStore.create(activeUserDataPath);
    const migrated = activeStore.getDatabase().prepare(
      'SELECT id, scope FROM cowork_sessions WHERE id = ?',
    ).get('legacy-session') as { id: string; scope: string };
    expect(migrated).toEqual({ id: 'legacy-session', scope: CoworkSessionScope.User });
  });

  test('excludes hidden sessions from normal list, count, search, pin, and agent deletion', async () => {
    const sqlite = await createFreshStore();
    const db = sqlite.getDatabase();
    const cowork = new CoworkStore(db);
    cowork.createAgent({ id: 'reviewer', name: 'Reviewer' });
    const user = cowork.createSession('Visible task', '', '', 'local', [], 'reviewer');
    const hidden = cowork.createSession(
      'Hidden meeting discussion',
      '',
      '',
      'local',
      [],
      'reviewer',
      '',
      CoworkSessionScope.MeetingHidden,
    );

    expect(cowork.countSessions()).toBe(1);
    expect(cowork.listSessions().map(session => session.id)).toEqual([user.id]);
    expect(cowork.searchSessions({ query: 'meeting', limit: 20, offset: 0 })).toEqual([]);
    expect(cowork.listSessionIdsByAgent('reviewer')).toEqual([user.id]);
    expect(cowork.setSessionPinned(hidden.id, true)).toBeNull();

    cowork.deleteAgent('reviewer');
    expect(cowork.getSession(user.id)).toBeNull();
    expect(cowork.getSession(hidden.id)?.scope).toBe(CoworkSessionScope.MeetingHidden);
    cowork.deleteSession(hidden.id);
    expect(cowork.getSession(hidden.id)).toBeNull();
  });
});

describe('meetingRoom store state machine', () => {
  test('plans rounds deterministically and omits round summaries for one round', async () => {
    const sqlite = await createFreshStore();
    const store = new MeetingRoomStore(sqlite.getDatabase());
    const oneRoundId = createDraft(store, 1);
    freezeDraft(store, oneRoundId);
    expect(store.listTurns(oneRoundId).map(turn => turn.kind)).toEqual([
      MeetingTurnKind.HostOpening,
      MeetingTurnKind.Participant,
      MeetingTurnKind.Participant,
      MeetingTurnKind.FinalSummary,
    ]);

    const threeRoundId = createDraft(store, 3, MeetingRoomMode.Brainstorm);
    expect(() => freezeDraft(store, threeRoundId)).toThrow('MEETING_ALREADY_RUNNING');
    store.stop(oneRoundId);
    freezeDraft(store, threeRoundId);
    expect(store.listTurns(threeRoundId).filter(turn => turn.kind === MeetingTurnKind.RoundSummary)).toHaveLength(2);
  });

  test('resumes from the first incomplete turn and rejects stale epoch events', async () => {
    const sqlite = await createFreshStore();
    const store = new MeetingRoomStore(sqlite.getDatabase());
    const meetingId = createDraft(store, 1);
    freezeDraft(store, meetingId);
    const first = store.getNextTurn(meetingId)!;
    const attempt = store.beginAttempt(meetingId, first.id);
    expect(store.updateAttemptStream({
      meetingId,
      turnId: first.id,
      attemptId: attempt.id,
      runEpoch: attempt.runEpoch,
      content: 'partial',
    })).toBe(true);

    store.pause(meetingId, MeetingPauseReason.User, true);
    expect(store.updateAttemptStream({
      meetingId,
      turnId: first.id,
      attemptId: attempt.id,
      runEpoch: attempt.runEpoch,
      content: 'late text',
    })).toBe(false);
    const pausedEpoch = store.get(meetingId)!.runEpoch;
    store.resume(meetingId);
    expect(store.get(meetingId)!.runEpoch).toBe(pausedEpoch + 1);
    expect(store.getNextTurn(meetingId)?.id).toBe(first.id);
    expect(store.getNextTurn(meetingId)?.status).toBe(MeetingTurnStatus.Pending);
  });

  test('appends one round, preserves the old summary turn, and enforces the limit', async () => {
    const sqlite = await createFreshStore();
    const db = sqlite.getDatabase();
    const store = new MeetingRoomStore(db);
    const meetingId = createDraft(store, 2, MeetingRoomMode.ExpertPanel);
    freezeDraft(store, meetingId);
    db.prepare('UPDATE meeting_turns SET status = ? WHERE meeting_id = ?')
      .run(MeetingTurnStatus.Completed, meetingId);
    store.markCompleted(meetingId);
    const oldSummaryId = store.listTurns(meetingId)
      .find(turn => turn.kind === MeetingTurnKind.FinalSummary)!.id;

    store.appendRound(meetingId, 'Consider the new compliance requirement.');
    const turns = store.listTurns(meetingId);
    expect(store.get(meetingId)?.totalRounds).toBe(3);
    expect(turns.some(turn => turn.id === oldSummaryId)).toBe(true);
    expect(turns.filter(turn => turn.kind === MeetingTurnKind.UserSupplement)).toHaveLength(1);
    expect(turns.filter(turn => turn.kind === MeetingTurnKind.RoundFocus)).toHaveLength(1);
    db.prepare('UPDATE meeting_turns SET status = ? WHERE meeting_id = ?')
      .run(MeetingTurnStatus.Completed, meetingId);
    store.markCompleted(meetingId);
    expect(() => store.appendRound(meetingId, 'One more')).toThrow('MEETING_ROUND_LIMIT');
  });

  test('cascades meeting rows while retaining no agent foreign key', async () => {
    const sqlite = await createFreshStore();
    const db = sqlite.getDatabase();
    const store = new MeetingRoomStore(db);
    const meetingId = createDraft(store, 1);
    freezeDraft(store, meetingId);
    const turn = store.getNextTurn(meetingId)!;
    store.beginAttempt(meetingId, turn.id);
    store.deleteRows(meetingId);
    for (const table of ['meeting_participants', 'meeting_turns', 'meeting_turn_attempts', 'meeting_attachments']) {
      const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
      expect(count.count).toBe(0);
    }
    const participantForeignKeys = db.prepare(`PRAGMA foreign_key_list('meeting_participants')`).all() as Array<{ from: string }>;
    expect(participantForeignKeys.some(key => key.from === 'agent_id')).toBe(false);
    expect(store.get(meetingId)).toBeNull();
  });

  test('atomically pauses all running rooms on restart', async () => {
    const sqlite = await createFreshStore();
    const store = new MeetingRoomStore(sqlite.getDatabase());
    const meetingId = createDraft(store, 1);
    freezeDraft(store, meetingId);
    expect(store.markRunningMeetingsPausedOnRestart()).toBe(1);
    expect(store.get(meetingId)).toMatchObject({
      status: MeetingRoomStatus.Paused,
      pauseReason: MeetingPauseReason.AppRestart,
    });
  });
});
