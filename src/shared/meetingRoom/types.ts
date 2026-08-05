import type {
  MeetingAttemptStatus,
  MeetingPauseReason,
  MeetingRoomMode,
  MeetingRoomStatus,
  MeetingStep,
  MeetingTurnKind,
  MeetingTurnStatus,
} from './constants';

export interface MeetingRoomParticipantInput {
  agentId: string;
  roleNote: string;
}

export interface MeetingRoomInlineAttachmentInput {
  originalName: string;
  mimeType: string;
  base64Data: string;
}

export interface MeetingRoomCreateInput {
  title?: string;
  topic: string;
  mode: MeetingRoomMode;
  totalRounds: number;
  participants: MeetingRoomParticipantInput[];
  attachmentPaths?: string[];
  inlineAttachments?: MeetingRoomInlineAttachmentInput[];
}

export interface MeetingRoomStartInput {
  meetingId: string;
  confirmNoVision?: boolean;
}

export interface MeetingRoomIdInput {
  meetingId: string;
}

export interface MeetingRoomAppendRoundInput extends MeetingRoomIdInput {
  supplement: string;
}

export interface MeetingRoomParticipantDto {
  id: string;
  agentId: string;
  name: string;
  avatar: string;
  model: string;
  supportsVision: boolean;
  roleNote: string;
  order: number;
}

export interface MeetingRoomAttachmentDto {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  order: number;
}

export interface MeetingTurnAttemptDto {
  id: string;
  attemptNumber: number;
  status: MeetingAttemptStatus;
  streamingContent: string;
  error: string | null;
  toolViolation: boolean;
  timeout: boolean;
  userAborted: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  startedAt: number;
  completedAt: number | null;
}

export interface MeetingTurnDto {
  id: string;
  round: number;
  order: number;
  kind: MeetingTurnKind;
  actorParticipantId: string | null;
  actorName: string;
  status: MeetingTurnStatus;
  content: string;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  startedAt: number | null;
  completedAt: number | null;
  attempts: MeetingTurnAttemptDto[];
}

export interface MeetingRoomListItemDto {
  id: string;
  title: string;
  mode: MeetingRoomMode;
  status: MeetingRoomStatus;
  totalRounds: number;
  currentRound: number;
  pauseReason: MeetingPauseReason | null;
  participants: MeetingRoomParticipantDto[];
  updatedAt: number;
  version: number;
}

export interface MeetingRoomDto extends MeetingRoomListItemDto {
  topic: string;
  currentStep: MeetingStep | null;
  currentTurnId: string | null;
  finalSummary: string;
  attachments: MeetingRoomAttachmentDto[];
  turns: MeetingTurnDto[];
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  allModelsLackVision: boolean;
}

export interface MeetingRoomChangedEvent {
  meetingId: string;
  status: MeetingRoomStatus;
  version: number;
}

export interface MeetingRoomTurnUpdateEvent {
  meetingId: string;
  turnId: string;
  attemptId: string;
  status: MeetingTurnStatus;
  content: string;
  version: number;
}

export const MeetingExportStatus = {
  Success: 'success',
  Cancelled: 'cancelled',
  Error: 'error',
} as const;
export type MeetingExportStatus = typeof MeetingExportStatus[keyof typeof MeetingExportStatus];

export interface MeetingExportResult {
  status: MeetingExportStatus;
  path?: string;
  error?: string;
}
