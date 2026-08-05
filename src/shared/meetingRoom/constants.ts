export const MeetingRoomMode = {
  Sequential: 'sequential',
  ExpertPanel: 'expert_panel',
  Brainstorm: 'brainstorm',
} as const;
export type MeetingRoomMode = typeof MeetingRoomMode[keyof typeof MeetingRoomMode];

export const MeetingRoomStatus = {
  Draft: 'draft',
  Running: 'running',
  Paused: 'paused',
  Completed: 'completed',
  Stopped: 'stopped',
} as const;
export type MeetingRoomStatus = typeof MeetingRoomStatus[keyof typeof MeetingRoomStatus];

export const MeetingPauseReason = {
  User: 'user',
  HostFailure: 'host_failure',
  AppRestart: 'app_restart',
  AuthorizationLost: 'authorization_lost',
  RuntimeUnavailable: 'runtime_unavailable',
} as const;
export type MeetingPauseReason = typeof MeetingPauseReason[keyof typeof MeetingPauseReason];

export const MeetingStep = {
  HostOpening: 'host_opening',
  RoundFocus: 'round_focus',
  Participant: 'participant',
  RoundSummary: 'round_summary',
  FinalSummary: 'final_summary',
} as const;
export type MeetingStep = typeof MeetingStep[keyof typeof MeetingStep];

export const MeetingTurnKind = {
  UserSupplement: 'user_supplement',
  HostOpening: 'host_opening',
  RoundFocus: 'round_focus',
  Participant: 'participant',
  RoundSummary: 'round_summary',
  FinalSummary: 'final_summary',
} as const;
export type MeetingTurnKind = typeof MeetingTurnKind[keyof typeof MeetingTurnKind];

export const MeetingTurnStatus = {
  Pending: 'pending',
  Running: 'running',
  Completed: 'completed',
  Interrupted: 'interrupted',
  Failed: 'failed',
  Skipped: 'skipped',
} as const;
export type MeetingTurnStatus = typeof MeetingTurnStatus[keyof typeof MeetingTurnStatus];

export const MeetingAttemptStatus = {
  Running: 'running',
  Completed: 'completed',
  Interrupted: 'interrupted',
  Failed: 'failed',
} as const;
export type MeetingAttemptStatus = typeof MeetingAttemptStatus[keyof typeof MeetingAttemptStatus];

export const CoworkSessionScope = {
  User: 'user',
  MeetingHidden: 'meeting_hidden',
} as const;
export type CoworkSessionScope = typeof CoworkSessionScope[keyof typeof CoworkSessionScope];

export const CoworkRunPolicy = {
  Default: 'default',
  Plan: 'plan',
  MeetingDiscussion: 'meeting_discussion',
} as const;
export type CoworkRunPolicy = typeof CoworkRunPolicy[keyof typeof CoworkRunPolicy];

export const MeetingRoomIpcChannel = {
  List: 'meeting-room:list',
  Get: 'meeting-room:get',
  Create: 'meeting-room:create',
  Delete: 'meeting-room:delete',
  Start: 'meeting-room:start',
  Pause: 'meeting-room:pause',
  Resume: 'meeting-room:resume',
  Stop: 'meeting-room:stop',
  AppendRound: 'meeting-room:append-round',
  RetryHost: 'meeting-room:retry-host',
  ExportMarkdown: 'meeting-room:export-markdown',
  ExportHtml: 'meeting-room:export-html',
  Changed: 'meeting-room:changed',
  TurnUpdate: 'meeting-room:turn-update',
} as const;
export type MeetingRoomIpcChannel = typeof MeetingRoomIpcChannel[keyof typeof MeetingRoomIpcChannel];

export const MeetingRoomLimits = {
  Title: 120,
  GeneratedTitle: 40,
  Topic: 8_000,
  RoleNote: 500,
  Supplement: 4_000,
  ParticipantsMin: 2,
  ParticipantsMax: 5,
  RoundsMin: 1,
  RoundsMax: 3,
  AttachmentsMax: 4,
  TurnTimeoutMs: 180_000,
} as const;

export const MeetingRoomActor = {
  Host: 'host',
} as const;

export const isMeetingRoomMode = (value: unknown): value is MeetingRoomMode =>
  typeof value === 'string' && Object.values(MeetingRoomMode).includes(value as MeetingRoomMode);

export const isMeetingRoomStatus = (value: unknown): value is MeetingRoomStatus =>
  typeof value === 'string' && Object.values(MeetingRoomStatus).includes(value as MeetingRoomStatus);

