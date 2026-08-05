import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

import {
  MeetingAttemptStatus,
  type MeetingAttemptStatus as MeetingAttemptStatusType,
  MeetingPauseReason,
  type MeetingPauseReason as MeetingPauseReasonType,
  MeetingRoomActor,
  MeetingRoomLimits,
  MeetingRoomStatus,
  type MeetingRoomStatus as MeetingRoomStatusType,
  MeetingStep,
  type MeetingStep as MeetingStepType,
  MeetingTurnKind,
  type MeetingTurnKind as MeetingTurnKindType,
  MeetingTurnStatus,
  type MeetingTurnStatus as MeetingTurnStatusType,
} from '../../shared/meetingRoom/constants';
import type {
  MeetingRoomAttachmentDto,
  MeetingRoomDto,
  MeetingRoomListItemDto,
  MeetingRoomParticipantDto,
  MeetingTurnAttemptDto,
  MeetingTurnDto,
} from '../../shared/meetingRoom/types';

export interface MeetingParticipantSnapshot extends MeetingRoomParticipantDto {
  identity: string;
  systemPrompt: string;
  hiddenSessionId: string | null;
}

export interface MeetingAttachmentRecord extends MeetingRoomAttachmentDto {
  managedPath: string;
}

export interface MeetingRoomRecord {
  id: string;
  title: string;
  topic: string;
  mode: MeetingRoomDto['mode'];
  status: MeetingRoomStatusType;
  totalRounds: number;
  currentRound: number;
  hostSessionId: string | null;
  hostModelSnapshot: string;
  hostSupportsVision: boolean;
  finalSummary: string;
  currentStep: MeetingStepType | null;
  currentTurnId: string | null;
  currentAttemptId: string | null;
  runEpoch: number;
  pauseReason: MeetingPauseReasonType | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface MeetingTurnRecord extends Omit<MeetingTurnDto, 'actorName' | 'attempts'> {
  meetingId: string;
}

export interface MeetingAttemptRecord extends MeetingTurnAttemptDto {
  turnId: string;
  openClawRunId: string | null;
  runEpoch: number;
  toolName: string | null;
  completedAt: number | null;
}

export interface CreateMeetingDraftRecord {
  id?: string;
  title: string;
  topic: string;
  mode: MeetingRoomDto['mode'];
  totalRounds: number;
  participants: Array<{
    id?: string;
    agentId: string;
    roleNote: string;
    name: string;
    avatar: string;
    model: string;
    supportsVision: boolean;
    identity: string;
    systemPrompt: string;
  }>;
  attachments: Array<{
    id?: string;
    originalName: string;
    mimeType: string;
    managedPath: string;
    sizeBytes: number;
  }>;
}

type MeetingRoomRow = {
  id: string;
  title: string;
  topic: string;
  mode: MeetingRoomDto['mode'];
  status: MeetingRoomStatusType;
  total_rounds: number;
  current_round: number;
  host_session_id: string | null;
  host_model_snapshot: string;
  host_supports_vision: number;
  final_summary: string;
  current_step: MeetingStepType | null;
  current_turn_id: string | null;
  current_attempt_id: string | null;
  run_epoch: number;
  pause_reason: MeetingPauseReasonType | null;
  version: number;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  completed_at: number | null;
};

export class MeetingRoomStore {
  constructor(private readonly db: Database.Database) {}

  createDraft(input: CreateMeetingDraftRecord): MeetingRoomDto {
    const meetingId = input.id ?? randomUUID();
    const now = Date.now();
    const insert = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO meeting_rooms (
          id, title, topic, mode, status, total_rounds, current_round,
          run_epoch, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)
      `).run(
        meetingId,
        input.title,
        input.topic,
        input.mode,
        MeetingRoomStatus.Draft,
        input.totalRounds,
        now,
        now,
      );

      const insertParticipant = this.db.prepare(`
        INSERT INTO meeting_participants (
          id, meeting_id, agent_id, speaking_order, role_note,
          name_snapshot, avatar_snapshot, model_snapshot, supports_vision_snapshot,
          identity_snapshot, system_prompt_snapshot, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      input.participants.forEach((participant, index) => {
        insertParticipant.run(
          participant.id ?? randomUUID(),
          meetingId,
          participant.agentId,
          index,
          participant.roleNote,
          participant.name,
          participant.avatar,
          participant.model,
          participant.supportsVision ? 1 : 0,
          participant.identity,
          participant.systemPrompt,
          now,
          now,
        );
      });

      const insertAttachment = this.db.prepare(`
        INSERT INTO meeting_attachments (
          id, meeting_id, original_name, mime_type, managed_path,
          size_bytes, attachment_order, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      input.attachments.forEach((attachment, index) => {
        insertAttachment.run(
          attachment.id ?? randomUUID(),
          meetingId,
          attachment.originalName,
          attachment.mimeType,
          attachment.managedPath,
          attachment.sizeBytes,
          index,
          now,
        );
      });
    });
    insert();
    return this.getDto(meetingId)!;
  }

  list(): MeetingRoomListItemDto[] {
    const rows = this.db.prepare(`
      SELECT * FROM meeting_rooms ORDER BY updated_at DESC, created_at DESC
    `).all() as MeetingRoomRow[];
    return rows.map(row => this.toListDto(this.mapMeeting(row)));
  }

  get(meetingId: string): MeetingRoomRecord | null {
    const row = this.db.prepare('SELECT * FROM meeting_rooms WHERE id = ?').get(meetingId) as MeetingRoomRow | undefined;
    return row ? this.mapMeeting(row) : null;
  }

  getDto(meetingId: string): MeetingRoomDto | null {
    const room = this.get(meetingId);
    if (!room) return null;
    const participants = this.listParticipants(meetingId);
    return {
      ...this.toListDto(room, participants),
      topic: room.topic,
      currentStep: room.currentStep,
      currentTurnId: room.currentTurnId,
      finalSummary: room.finalSummary,
      attachments: this.listAttachments(meetingId).map(({ managedPath: _managedPath, ...dto }) => dto),
      turns: this.listTurnDtos(meetingId, participants),
      createdAt: room.createdAt,
      startedAt: room.startedAt,
      completedAt: room.completedAt,
      allModelsLackVision: !room.hostSupportsVision && participants.every(participant => !participant.supportsVision),
    };
  }

  listParticipants(meetingId: string): MeetingParticipantSnapshot[] {
    const rows = this.db.prepare(`
      SELECT * FROM meeting_participants
      WHERE meeting_id = ? ORDER BY speaking_order ASC
    `).all(meetingId) as Array<{
      id: string;
      agent_id: string;
      speaking_order: number;
      role_note: string;
      name_snapshot: string;
      avatar_snapshot: string;
      model_snapshot: string;
      supports_vision_snapshot: number;
      identity_snapshot: string;
      system_prompt_snapshot: string;
      hidden_session_id: string | null;
    }>;
    return rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      order: row.speaking_order,
      roleNote: row.role_note,
      name: row.name_snapshot,
      avatar: row.avatar_snapshot,
      model: row.model_snapshot,
      supportsVision: Boolean(row.supports_vision_snapshot),
      identity: row.identity_snapshot,
      systemPrompt: row.system_prompt_snapshot,
      hiddenSessionId: row.hidden_session_id,
    }));
  }

  listAttachments(meetingId: string): MeetingAttachmentRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM meeting_attachments
      WHERE meeting_id = ? ORDER BY attachment_order ASC
    `).all(meetingId) as Array<{
      id: string;
      original_name: string;
      mime_type: string;
      managed_path: string;
      size_bytes: number;
      attachment_order: number;
    }>;
    return rows.map(row => ({
      id: row.id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      managedPath: row.managed_path,
      sizeBytes: row.size_bytes,
      order: row.attachment_order,
    }));
  }

  freezeForStart(input: {
    meetingId: string;
    hostSessionId: string;
    hostModel: string;
    hostSupportsVision: boolean;
    participants: Array<MeetingParticipantSnapshot & { hiddenSessionId: string }>;
  }): MeetingRoomRecord {
    const now = Date.now();
    const freeze = this.db.transaction(() => {
      const room = this.require(input.meetingId);
      if (room.status !== MeetingRoomStatus.Draft) {
        throw new Error('MEETING_NOT_DRAFT');
      }
      const running = this.db.prepare(
        'SELECT id FROM meeting_rooms WHERE status = ? AND id != ? LIMIT 1',
      ).get(MeetingRoomStatus.Running, input.meetingId) as { id: string } | undefined;
      if (running) throw new Error('MEETING_ALREADY_RUNNING');

      const updateParticipant = this.db.prepare(`
        UPDATE meeting_participants SET
          name_snapshot = ?, avatar_snapshot = ?, model_snapshot = ?,
          supports_vision_snapshot = ?, identity_snapshot = ?, system_prompt_snapshot = ?,
          role_note = ?, speaking_order = ?, hidden_session_id = ?, updated_at = ?
        WHERE id = ? AND meeting_id = ?
      `);
      input.participants.forEach(participant => {
        updateParticipant.run(
          participant.name,
          participant.avatar,
          participant.model,
          participant.supportsVision ? 1 : 0,
          participant.identity,
          participant.systemPrompt,
          participant.roleNote,
          participant.order,
          participant.hiddenSessionId,
          now,
          participant.id,
          input.meetingId,
        );
      });

      this.insertInitialTurns(room, input.participants, now);
      this.db.prepare(`
        UPDATE meeting_rooms SET
          status = ?, host_session_id = ?, host_model_snapshot = ?, host_supports_vision = ?,
          current_round = 0, current_step = NULL, current_turn_id = NULL,
          current_attempt_id = NULL, pause_reason = NULL, run_epoch = run_epoch + 1,
          version = version + 1, updated_at = ?, started_at = ?, completed_at = NULL
        WHERE id = ?
      `).run(
        MeetingRoomStatus.Running,
        input.hostSessionId,
        input.hostModel,
        input.hostSupportsVision ? 1 : 0,
        now,
        now,
        input.meetingId,
      );
    });
    freeze();
    return this.require(input.meetingId);
  }

  getNextTurn(meetingId: string): MeetingTurnRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM meeting_turns
      WHERE meeting_id = ? AND status NOT IN (?, ?)
      ORDER BY round_number ASC, turn_order ASC, created_at ASC
      LIMIT 1
    `).get(meetingId, MeetingTurnStatus.Completed, MeetingTurnStatus.Skipped) as Record<string, unknown> | undefined;
    return row ? this.mapTurn(row) : null;
  }

  getTurn(turnId: string): MeetingTurnRecord | null {
    const row = this.db.prepare('SELECT * FROM meeting_turns WHERE id = ?').get(turnId) as Record<string, unknown> | undefined;
    return row ? this.mapTurn(row) : null;
  }

  listTurns(meetingId: string): MeetingTurnRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM meeting_turns
      WHERE meeting_id = ? ORDER BY round_number ASC, turn_order ASC, created_at ASC
    `).all(meetingId) as Array<Record<string, unknown>>;
    return rows.map(row => this.mapTurn(row));
  }

  beginAttempt(meetingId: string, turnId: string): MeetingAttemptRecord {
    const now = Date.now();
    let attemptId = '';
    const begin = this.db.transaction(() => {
      const room = this.require(meetingId);
      if (room.status !== MeetingRoomStatus.Running) throw new Error('MEETING_NOT_RUNNING');
      const turn = this.getTurn(turnId);
      if (!turn || turn.meetingId !== meetingId) throw new Error('MEETING_TURN_NOT_FOUND');
      const numberRow = this.db.prepare(`
        SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next
        FROM meeting_turn_attempts WHERE turn_id = ?
      `).get(turnId) as { next: number };
      attemptId = randomUUID();
      this.db.prepare(`
        INSERT INTO meeting_turn_attempts (
          id, turn_id, attempt_number, run_epoch, status,
          started_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(attemptId, turnId, numberRow.next, room.runEpoch, MeetingAttemptStatus.Running, now, now, now);
      this.db.prepare(`
        UPDATE meeting_turns SET status = ?, error = NULL,
          started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?
      `).run(MeetingTurnStatus.Running, now, now, turnId);
      this.db.prepare(`
        UPDATE meeting_rooms SET current_round = ?, current_step = ?, current_turn_id = ?,
          current_attempt_id = ?, version = version + 1, updated_at = ? WHERE id = ?
      `).run(turn.round, this.stepForTurn(turn.kind), turnId, attemptId, now, meetingId);
    });
    begin();
    return this.getAttempt(attemptId)!;
  }

  bindAttemptRun(meetingId: string, turnId: string, attemptId: string, runEpoch: number, runId: string): boolean {
    const result = this.db.prepare(`
      UPDATE meeting_turn_attempts SET openclaw_run_id = ?, updated_at = ?
      WHERE id = ? AND turn_id = ? AND run_epoch = ?
        AND EXISTS (
          SELECT 1 FROM meeting_rooms
          WHERE id = ? AND status = ? AND current_turn_id = ?
            AND current_attempt_id = ? AND run_epoch = ?
        )
    `).run(
      runId,
      Date.now(),
      attemptId,
      turnId,
      runEpoch,
      meetingId,
      MeetingRoomStatus.Running,
      turnId,
      attemptId,
      runEpoch,
    );
    return result.changes === 1;
  }

  updateAttemptStream(input: {
    meetingId: string;
    turnId: string;
    attemptId: string;
    runEpoch: number;
    runId?: string;
    content: string;
  }): boolean {
    const room = this.get(input.meetingId);
    if (!room || room.status !== MeetingRoomStatus.Running
      || room.currentTurnId !== input.turnId
      || room.currentAttemptId !== input.attemptId
      || room.runEpoch !== input.runEpoch) return false;
    const attempt = this.getAttempt(input.attemptId);
    if (!attempt || attempt.turnId !== input.turnId || attempt.runEpoch !== input.runEpoch) return false;
    if (input.runId && attempt.openClawRunId && attempt.openClawRunId !== input.runId) return false;
    const now = Date.now();
    const update = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE meeting_turn_attempts SET streaming_content = ?, updated_at = ? WHERE id = ?
      `).run(input.content, now, input.attemptId);
      this.db.prepare(`
        UPDATE meeting_rooms SET version = version + 1, updated_at = ? WHERE id = ?
      `).run(now, input.meetingId);
    });
    update();
    return true;
  }

  completeAttempt(input: {
    meetingId: string;
    turnId: string;
    attemptId: string;
    runEpoch: number;
    content: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
  }): boolean {
    if (!this.matchesActive(input.meetingId, input.turnId, input.attemptId, input.runEpoch)) return false;
    const now = Date.now();
    const complete = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE meeting_turn_attempts SET status = ?, streaming_content = ?,
          input_tokens = ?, output_tokens = ?, completed_at = ?, updated_at = ? WHERE id = ?
      `).run(
        MeetingAttemptStatus.Completed,
        input.content,
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        now,
        now,
        input.attemptId,
      );
      this.db.prepare(`
        UPDATE meeting_turns SET status = ?, final_content = ?, error = NULL,
          input_tokens = ?, output_tokens = ?, completed_at = ?, updated_at = ? WHERE id = ?
      `).run(
        MeetingTurnStatus.Completed,
        input.content,
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        now,
        now,
        input.turnId,
      );
      const turn = this.getTurn(input.turnId)!;
      const finalSummary = turn.kind === MeetingTurnKind.FinalSummary ? input.content : undefined;
      this.db.prepare(`
        UPDATE meeting_rooms SET current_turn_id = NULL, current_attempt_id = NULL,
          current_step = NULL, final_summary = COALESCE(?, final_summary),
          version = version + 1, updated_at = ? WHERE id = ?
      `).run(finalSummary ?? null, now, input.meetingId);
    });
    complete();
    return true;
  }

  failAttempt(input: {
    meetingId: string;
    turnId: string;
    attemptId: string;
    runEpoch: number;
    error: string;
    interrupted?: boolean;
    skipped?: boolean;
    toolViolation?: boolean;
    toolName?: string;
    timeout?: boolean;
    userAborted?: boolean;
  }): boolean {
    if (!this.matchesActive(input.meetingId, input.turnId, input.attemptId, input.runEpoch)) return false;
    const now = Date.now();
    const attemptStatus = input.interrupted ? MeetingAttemptStatus.Interrupted : MeetingAttemptStatus.Failed;
    const turnStatus = input.skipped
      ? MeetingTurnStatus.Skipped
      : input.interrupted
        ? MeetingTurnStatus.Interrupted
        : MeetingTurnStatus.Failed;
    const fail = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE meeting_turn_attempts SET status = ?, error = ?, tool_violation = ?,
          tool_name = ?, timeout = ?, user_aborted = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        attemptStatus,
        input.error,
        input.toolViolation ? 1 : 0,
        input.toolName ?? null,
        input.timeout ? 1 : 0,
        input.userAborted ? 1 : 0,
        now,
        now,
        input.attemptId,
      );
      this.db.prepare(`
        UPDATE meeting_turns SET status = ?, error = ?, completed_at = ?, updated_at = ? WHERE id = ?
      `).run(turnStatus, input.error, input.skipped ? now : null, now, input.turnId);
      this.db.prepare(`
        UPDATE meeting_rooms SET current_turn_id = NULL, current_attempt_id = NULL,
          current_step = NULL, version = version + 1, updated_at = ? WHERE id = ?
      `).run(now, input.meetingId);
    });
    fail();
    return true;
  }

  resetTurnForRetry(turnId: string): void {
    this.db.prepare(`
      UPDATE meeting_turns SET status = ?, error = NULL, completed_at = NULL, updated_at = ? WHERE id = ?
    `).run(MeetingTurnStatus.Pending, Date.now(), turnId);
  }

  pause(meetingId: string, reason: MeetingPauseReasonType, userAborted: boolean): MeetingRoomRecord {
    const now = Date.now();
    const pause = this.db.transaction(() => {
      const room = this.require(meetingId);
      if (room.status === MeetingRoomStatus.Paused) return;
      if (room.status !== MeetingRoomStatus.Running) throw new Error('MEETING_NOT_RUNNING');
      if (room.currentAttemptId && room.currentTurnId) {
        this.db.prepare(`
          UPDATE meeting_turn_attempts SET status = ?, error = ?, user_aborted = ?,
            completed_at = ?, updated_at = ? WHERE id = ? AND status = ?
        `).run(
          MeetingAttemptStatus.Interrupted,
          reason,
          userAborted ? 1 : 0,
          now,
          now,
          room.currentAttemptId,
          MeetingAttemptStatus.Running,
        );
        this.db.prepare(`
          UPDATE meeting_turns SET status = ?, error = ?, updated_at = ? WHERE id = ?
        `).run(MeetingTurnStatus.Interrupted, reason, now, room.currentTurnId);
      }
      this.db.prepare(`
        UPDATE meeting_rooms SET status = ?, pause_reason = ?, run_epoch = run_epoch + 1,
          current_attempt_id = NULL, current_turn_id = NULL, current_step = NULL,
          version = version + 1, updated_at = ? WHERE id = ?
      `).run(MeetingRoomStatus.Paused, reason, now, meetingId);
    });
    pause();
    return this.require(meetingId);
  }

  resume(meetingId: string): MeetingRoomRecord {
    const now = Date.now();
    const resume = this.db.transaction(() => {
      const room = this.require(meetingId);
      if (room.status === MeetingRoomStatus.Running) return;
      if (room.status !== MeetingRoomStatus.Paused) throw new Error('MEETING_NOT_PAUSED');
      const running = this.db.prepare(
        'SELECT id FROM meeting_rooms WHERE status = ? AND id != ? LIMIT 1',
      ).get(MeetingRoomStatus.Running, meetingId) as { id: string } | undefined;
      if (running) throw new Error('MEETING_ALREADY_RUNNING');
      if (room.currentTurnId) this.resetTurnForRetry(room.currentTurnId);
      this.db.prepare(`
        UPDATE meeting_turns SET status = ?, error = NULL, completed_at = NULL, updated_at = ?
        WHERE meeting_id = ? AND status IN (?, ?)
      `).run(
        MeetingTurnStatus.Pending,
        now,
        meetingId,
        MeetingTurnStatus.Interrupted,
        MeetingTurnStatus.Failed,
      );
      this.db.prepare(`
        UPDATE meeting_rooms SET status = ?, pause_reason = NULL, run_epoch = run_epoch + 1,
          current_attempt_id = NULL, current_turn_id = NULL, current_step = NULL,
          version = version + 1, updated_at = ? WHERE id = ?
      `).run(MeetingRoomStatus.Running, now, meetingId);
    });
    resume();
    return this.require(meetingId);
  }

  stop(meetingId: string): MeetingRoomRecord {
    const now = Date.now();
    const stop = this.db.transaction(() => {
      const room = this.require(meetingId);
      if (room.status === MeetingRoomStatus.Stopped) return;
      if (room.status === MeetingRoomStatus.Completed) throw new Error('MEETING_ALREADY_COMPLETED');
      if (room.status !== MeetingRoomStatus.Running && room.status !== MeetingRoomStatus.Paused) {
        throw new Error('MEETING_STOP_NOT_ALLOWED');
      }
      if (room.currentAttemptId) {
        this.db.prepare(`
          UPDATE meeting_turn_attempts SET status = ?, error = ?, user_aborted = 1,
            completed_at = ?, updated_at = ? WHERE id = ? AND status = ?
        `).run(
          MeetingAttemptStatus.Interrupted,
          MeetingRoomStatus.Stopped,
          now,
          now,
          room.currentAttemptId,
          MeetingAttemptStatus.Running,
        );
      }
      if (room.currentTurnId) {
        this.db.prepare(`
          UPDATE meeting_turns SET status = ?, error = ?, updated_at = ? WHERE id = ?
        `).run(MeetingTurnStatus.Interrupted, MeetingRoomStatus.Stopped, now, room.currentTurnId);
      }
      this.db.prepare(`
        UPDATE meeting_rooms SET status = ?, run_epoch = run_epoch + 1,
          current_attempt_id = NULL, current_turn_id = NULL, current_step = NULL,
          pause_reason = NULL, version = version + 1, updated_at = ? WHERE id = ?
      `).run(MeetingRoomStatus.Stopped, now, meetingId);
    });
    stop();
    return this.require(meetingId);
  }

  markCompleted(meetingId: string): MeetingRoomRecord {
    const now = Date.now();
    this.db.prepare(`
      UPDATE meeting_rooms SET status = ?, pause_reason = NULL, current_step = NULL,
        current_turn_id = NULL, current_attempt_id = NULL, version = version + 1,
        updated_at = ?, completed_at = ? WHERE id = ? AND status = ?
    `).run(MeetingRoomStatus.Completed, now, now, meetingId, MeetingRoomStatus.Running);
    return this.require(meetingId);
  }

  appendRound(meetingId: string, supplement: string): MeetingRoomRecord {
    const now = Date.now();
    const append = this.db.transaction(() => {
      const room = this.require(meetingId);
      if (room.status !== MeetingRoomStatus.Completed) throw new Error('MEETING_NOT_COMPLETED');
      if (room.totalRounds >= MeetingRoomLimits.RoundsMax) throw new Error('MEETING_ROUND_LIMIT');
      const running = this.db.prepare(
        'SELECT id FROM meeting_rooms WHERE status = ? AND id != ? LIMIT 1',
      ).get(MeetingRoomStatus.Running, meetingId) as { id: string } | undefined;
      if (running) throw new Error('MEETING_ALREADY_RUNNING');
      const nextRound = room.totalRounds + 1;
      const participants = this.listParticipants(meetingId);
      this.insertTurn(meetingId, nextRound, -2, MeetingTurnKind.UserSupplement, null, MeetingTurnStatus.Completed, now, supplement);
      this.insertTurn(meetingId, nextRound, -1, MeetingTurnKind.RoundFocus, null, MeetingTurnStatus.Pending, now);
      participants.forEach((participant, index) => {
        this.insertTurn(meetingId, nextRound, index, MeetingTurnKind.Participant, participant.id, MeetingTurnStatus.Pending, now);
      });
      this.insertTurn(meetingId, nextRound, participants.length + 1, MeetingTurnKind.FinalSummary, null, MeetingTurnStatus.Pending, now);
      this.db.prepare(`
        UPDATE meeting_rooms SET status = ?, total_rounds = ?, current_round = ?,
          current_step = NULL, current_turn_id = NULL, current_attempt_id = NULL,
          pause_reason = NULL, run_epoch = run_epoch + 1, version = version + 1,
          updated_at = ?, completed_at = NULL WHERE id = ?
      `).run(MeetingRoomStatus.Running, nextRound, nextRound, now, meetingId);
    });
    append();
    return this.require(meetingId);
  }

  markRunningMeetingsPausedOnRestart(): number {
    const now = Date.now();
    const pause = this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT id, current_turn_id, current_attempt_id FROM meeting_rooms WHERE status = ?
      `).all(MeetingRoomStatus.Running) as Array<{
        id: string;
        current_turn_id: string | null;
        current_attempt_id: string | null;
      }>;
      for (const row of rows) {
        if (row.current_attempt_id) {
          this.db.prepare(`
            UPDATE meeting_turn_attempts SET status = ?, error = ?, completed_at = ?, updated_at = ?
            WHERE id = ? AND status = ?
          `).run(
            MeetingAttemptStatus.Interrupted,
            MeetingPauseReason.AppRestart,
            now,
            now,
            row.current_attempt_id,
            MeetingAttemptStatus.Running,
          );
        }
        if (row.current_turn_id) {
          this.db.prepare(`
            UPDATE meeting_turns SET status = ?, error = ?, updated_at = ? WHERE id = ?
          `).run(MeetingTurnStatus.Interrupted, MeetingPauseReason.AppRestart, now, row.current_turn_id);
        }
      }
      return this.db.prepare(`
        UPDATE meeting_rooms SET status = ?, pause_reason = ?, run_epoch = run_epoch + 1,
          current_turn_id = NULL, current_attempt_id = NULL, current_step = NULL,
          version = version + 1, updated_at = ? WHERE status = ?
      `).run(
        MeetingRoomStatus.Paused,
        MeetingPauseReason.AppRestart,
        now,
        MeetingRoomStatus.Running,
      ).changes;
    });
    return pause();
  }

  deleteRows(meetingId: string): void {
    this.db.prepare('DELETE FROM meeting_rooms WHERE id = ?').run(meetingId);
  }

  invalidateForDelete(meetingId: string): MeetingRoomRecord {
    const room = this.require(meetingId);
    this.db.prepare(`
      UPDATE meeting_rooms SET run_epoch = run_epoch + 1,
        version = version + 1, updated_at = ? WHERE id = ?
    `).run(Date.now(), meetingId);
    return { ...room, runEpoch: room.runEpoch + 1 };
  }

  listHiddenSessionIds(meetingId: string): string[] {
    const room = this.get(meetingId);
    if (!room) return [];
    return [room.hostSessionId, ...this.listParticipants(meetingId).map(participant => participant.hiddenSessionId)]
      .filter((value): value is string => Boolean(value));
  }

  getAttempt(attemptId: string): MeetingAttemptRecord | null {
    const row = this.db.prepare('SELECT * FROM meeting_turn_attempts WHERE id = ?').get(attemptId) as Record<string, unknown> | undefined;
    return row ? this.mapAttempt(row) : null;
  }

  countFailedAttempts(turnId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM meeting_turn_attempts
      WHERE turn_id = ? AND status = ? AND user_aborted = 0
    `).get(turnId, MeetingAttemptStatus.Failed) as { count: number };
    return row.count;
  }

  private listTurnDtos(meetingId: string, participants: MeetingParticipantSnapshot[]): MeetingTurnDto[] {
    const participantNames = new Map(participants.map(participant => [participant.id, participant.name]));
    const rows = this.db.prepare(`
      SELECT * FROM meeting_turns
      WHERE meeting_id = ? ORDER BY round_number ASC, turn_order ASC, created_at ASC
    `).all(meetingId) as Array<Record<string, unknown>>;
    return rows.map(row => {
      const turn = this.mapTurn(row);
      const actorName = turn.actorParticipantId
        ? participantNames.get(turn.actorParticipantId) ?? 'Participant'
        : MeetingRoomActor.Host;
      return {
        ...turn,
        actorName,
        attempts: this.listAttemptDtos(turn.id),
      };
    });
  }

  private listAttemptDtos(turnId: string): MeetingTurnAttemptDto[] {
    const rows = this.db.prepare(`
      SELECT * FROM meeting_turn_attempts WHERE turn_id = ? ORDER BY attempt_number ASC
    `).all(turnId) as Array<Record<string, unknown>>;
    return rows.map(row => {
      const attempt = this.mapAttempt(row);
      return {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        streamingContent: attempt.streamingContent,
        error: attempt.error,
        toolViolation: attempt.toolViolation,
        timeout: attempt.timeout,
        userAborted: attempt.userAborted,
        inputTokens: attempt.inputTokens,
        outputTokens: attempt.outputTokens,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
      };
    });
  }

  private insertInitialTurns(room: MeetingRoomRecord, participants: MeetingParticipantSnapshot[], now: number): void {
    this.insertTurn(room.id, 0, 0, MeetingTurnKind.HostOpening, null, MeetingTurnStatus.Pending, now);
    for (let round = 1; round <= room.totalRounds; round += 1) {
      participants.forEach((participant, index) => {
        this.insertTurn(room.id, round, index, MeetingTurnKind.Participant, participant.id, MeetingTurnStatus.Pending, now);
      });
      if (round < room.totalRounds) {
        this.insertTurn(room.id, round, participants.length + 1, MeetingTurnKind.RoundSummary, null, MeetingTurnStatus.Pending, now);
      }
    }
    this.insertTurn(
      room.id,
      room.totalRounds,
      participants.length + 2,
      MeetingTurnKind.FinalSummary,
      null,
      MeetingTurnStatus.Pending,
      now,
    );
  }

  private insertTurn(
    meetingId: string,
    round: number,
    order: number,
    kind: MeetingTurnKindType,
    participantId: string | null,
    status: MeetingTurnStatusType,
    now: number,
    content = '',
  ): void {
    this.db.prepare(`
      INSERT INTO meeting_turns (
        id, meeting_id, round_number, turn_order, kind, actor_participant_id,
        status, final_content, started_at, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      meetingId,
      round,
      order,
      kind,
      participantId,
      status,
      content,
      status === MeetingTurnStatus.Completed ? now : null,
      status === MeetingTurnStatus.Completed ? now : null,
      now,
      now,
    );
  }

  private matchesActive(meetingId: string, turnId: string, attemptId: string, runEpoch: number): boolean {
    const room = this.get(meetingId);
    if (!room || room.status !== MeetingRoomStatus.Running
      || room.currentTurnId !== turnId
      || room.currentAttemptId !== attemptId
      || room.runEpoch !== runEpoch) return false;
    const attempt = this.getAttempt(attemptId);
    return Boolean(attempt && attempt.turnId === turnId && attempt.runEpoch === runEpoch);
  }

  private stepForTurn(kind: MeetingTurnKindType): MeetingStepType {
    switch (kind) {
      case MeetingTurnKind.HostOpening: return MeetingStep.HostOpening;
      case MeetingTurnKind.RoundFocus: return MeetingStep.RoundFocus;
      case MeetingTurnKind.Participant: return MeetingStep.Participant;
      case MeetingTurnKind.RoundSummary: return MeetingStep.RoundSummary;
      case MeetingTurnKind.FinalSummary: return MeetingStep.FinalSummary;
      case MeetingTurnKind.UserSupplement: return MeetingStep.RoundFocus;
    }
  }

  private require(meetingId: string): MeetingRoomRecord {
    const room = this.get(meetingId);
    if (!room) throw new Error('MEETING_NOT_FOUND');
    return room;
  }

  private toListDto(room: MeetingRoomRecord, snapshots?: MeetingParticipantSnapshot[]): MeetingRoomListItemDto {
    const participants = snapshots ?? this.listParticipants(room.id);
    return {
      id: room.id,
      title: room.title,
      mode: room.mode,
      status: room.status,
      totalRounds: room.totalRounds,
      currentRound: room.currentRound,
      pauseReason: room.pauseReason,
      participants: participants.map(({ identity: _identity, systemPrompt: _systemPrompt, hiddenSessionId: _hiddenSessionId, ...dto }) => dto),
      updatedAt: room.updatedAt,
      version: room.version,
    };
  }

  private mapMeeting(row: MeetingRoomRow): MeetingRoomRecord {
    return {
      id: row.id,
      title: row.title,
      topic: row.topic,
      mode: row.mode,
      status: row.status,
      totalRounds: row.total_rounds,
      currentRound: row.current_round,
      hostSessionId: row.host_session_id,
      hostModelSnapshot: row.host_model_snapshot,
      hostSupportsVision: Boolean(row.host_supports_vision),
      finalSummary: row.final_summary,
      currentStep: row.current_step,
      currentTurnId: row.current_turn_id,
      currentAttemptId: row.current_attempt_id,
      runEpoch: row.run_epoch,
      pauseReason: row.pause_reason,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }

  private mapTurn(row: Record<string, unknown>): MeetingTurnRecord {
    return {
      id: String(row.id),
      meetingId: String(row.meeting_id),
      round: Number(row.round_number),
      order: Number(row.turn_order),
      kind: row.kind as MeetingTurnKindType,
      actorParticipantId: typeof row.actor_participant_id === 'string' ? row.actor_participant_id : null,
      status: row.status as MeetingTurnStatusType,
      content: typeof row.final_content === 'string' ? row.final_content : '',
      error: typeof row.error === 'string' ? row.error : null,
      inputTokens: typeof row.input_tokens === 'number' ? row.input_tokens : null,
      outputTokens: typeof row.output_tokens === 'number' ? row.output_tokens : null,
      startedAt: typeof row.started_at === 'number' ? row.started_at : null,
      completedAt: typeof row.completed_at === 'number' ? row.completed_at : null,
    };
  }

  private mapAttempt(row: Record<string, unknown>): MeetingAttemptRecord {
    return {
      id: String(row.id),
      turnId: String(row.turn_id),
      attemptNumber: Number(row.attempt_number),
      openClawRunId: typeof row.openclaw_run_id === 'string' ? row.openclaw_run_id : null,
      runEpoch: Number(row.run_epoch),
      status: row.status as MeetingAttemptStatusType,
      streamingContent: typeof row.streaming_content === 'string' ? row.streaming_content : '',
      error: typeof row.error === 'string' ? row.error : null,
      toolViolation: Boolean(row.tool_violation),
      toolName: typeof row.tool_name === 'string' ? row.tool_name : null,
      timeout: Boolean(row.timeout),
      userAborted: Boolean(row.user_aborted),
      inputTokens: typeof row.input_tokens === 'number' ? row.input_tokens : null,
      outputTokens: typeof row.output_tokens === 'number' ? row.output_tokens : null,
      startedAt: Number(row.started_at),
      completedAt: typeof row.completed_at === 'number' ? row.completed_at : null,
    };
  }
}
