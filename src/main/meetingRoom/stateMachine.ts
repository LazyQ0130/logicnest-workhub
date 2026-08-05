import {
  MeetingRoomLimits,
  MeetingRoomStatus,
  MeetingTurnKind,
  MeetingTurnStatus,
} from '../../shared/meetingRoom/constants';
import type { MeetingRoomRecord, MeetingTurnRecord } from './store';

export const isMeetingHostTurn = (turn: MeetingTurnRecord): boolean =>
  turn.kind !== MeetingTurnKind.Participant && turn.kind !== MeetingTurnKind.UserSupplement;

export const isMeetingTurnTerminal = (turn: MeetingTurnRecord): boolean =>
  turn.status === MeetingTurnStatus.Completed || turn.status === MeetingTurnStatus.Skipped;

export const canStartMeeting = (room: MeetingRoomRecord): boolean =>
  room.status === MeetingRoomStatus.Draft;

export const canResumeMeeting = (room: MeetingRoomRecord): boolean =>
  room.status === MeetingRoomStatus.Paused;

export const canAppendMeetingRound = (room: MeetingRoomRecord): boolean =>
  room.status === MeetingRoomStatus.Completed && room.totalRounds < MeetingRoomLimits.RoundsMax;

export const shouldRetryParticipantTurn = (failedAttemptCount: number): boolean =>
  failedAttemptCount < 2;

export const shouldRetryHostToolViolation = (failedToolViolationCount: number): boolean =>
  failedToolViolationCount < 2;
