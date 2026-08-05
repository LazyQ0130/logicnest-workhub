import fs from 'fs';
import path from 'path';

import { COWORK_IMAGE_ATTACHMENT_MAX_BYTES } from '../../shared/cowork/imageAttachments';
import {
  isMeetingRoomMode,
  MeetingRoomLimits,
} from '../../shared/meetingRoom/constants';
import type {
  MeetingRoomCreateInput,
  MeetingRoomInlineAttachmentInput,
} from '../../shared/meetingRoom/types';

const MeetingImageFormat = {
  Png: 'png',
  Jpeg: 'jpeg',
  Gif: 'gif',
  Webp: 'webp',
} as const;
type MeetingImageFormat = typeof MeetingImageFormat[keyof typeof MeetingImageFormat];

const imageByExtension: Record<string, { mimeType: string; format: MeetingImageFormat }> = {
  '.png': { mimeType: 'image/png', format: MeetingImageFormat.Png },
  '.jpg': { mimeType: 'image/jpeg', format: MeetingImageFormat.Jpeg },
  '.jpeg': { mimeType: 'image/jpeg', format: MeetingImageFormat.Jpeg },
  '.gif': { mimeType: 'image/gif', format: MeetingImageFormat.Gif },
  '.webp': { mimeType: 'image/webp', format: MeetingImageFormat.Webp },
};

export interface ValidatedMeetingAttachment {
  sourcePath: string;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
}

export interface ValidatedMeetingInlineAttachment extends ValidatedMeetingAttachment {
  buffer: Buffer;
}

const isUuid = (value: unknown): value is string =>
  typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const validateMeetingId = (value: unknown): string => {
  if (!isUuid(value)) throw new Error('MEETING_INVALID_ID');
  return value;
};

export const generateMeetingTitle = (topic: string): string => {
  const normalized = topic.replace(/\s+/g, ' ').trim();
  const firstSentence = normalized.split(/(?<=[。！？.!?])\s*/u).find(sentence => sentence.trim()) ?? normalized;
  return firstSentence.trim().slice(0, MeetingRoomLimits.GeneratedTitle);
};

export const validateMeetingCreateInput = (value: unknown): MeetingRoomCreateInput => {
  if (!value || typeof value !== 'object') throw new Error('MEETING_INVALID_INPUT');
  const input = value as Partial<MeetingRoomCreateInput>;
  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!topic) throw new Error('MEETING_TOPIC_REQUIRED');
  if (topic.length > MeetingRoomLimits.Topic) throw new Error('MEETING_TOPIC_TOO_LONG');
  if (title.length > MeetingRoomLimits.Title) throw new Error('MEETING_TITLE_TOO_LONG');
  if (!isMeetingRoomMode(input.mode)) throw new Error('MEETING_INVALID_MODE');
  if (!Number.isInteger(input.totalRounds)
    || input.totalRounds! < MeetingRoomLimits.RoundsMin
    || input.totalRounds! > MeetingRoomLimits.RoundsMax) {
    throw new Error('MEETING_INVALID_ROUNDS');
  }
  if (!Array.isArray(input.participants)
    || input.participants.length < MeetingRoomLimits.ParticipantsMin
    || input.participants.length > MeetingRoomLimits.ParticipantsMax) {
    throw new Error('MEETING_INVALID_PARTICIPANTS');
  }
  const seen = new Set<string>();
  const participants = input.participants.map(participant => {
    const agentId = typeof participant?.agentId === 'string' ? participant.agentId.trim() : '';
    const roleNote = typeof participant?.roleNote === 'string' ? participant.roleNote.trim() : '';
    if (!agentId || agentId.length > 200) throw new Error('MEETING_INVALID_AGENT');
    if (seen.has(agentId)) throw new Error('MEETING_DUPLICATE_AGENT');
    if (roleNote.length > MeetingRoomLimits.RoleNote) throw new Error('MEETING_ROLE_NOTE_TOO_LONG');
    seen.add(agentId);
    return { agentId, roleNote };
  });
  const attachmentPaths = input.attachmentPaths;
  const inlineAttachments = input.inlineAttachments;
  if (attachmentPaths !== undefined && !Array.isArray(attachmentPaths)) {
    throw new Error('MEETING_INVALID_ATTACHMENTS');
  }
  if (inlineAttachments !== undefined && !Array.isArray(inlineAttachments)) {
    throw new Error('MEETING_INVALID_ATTACHMENTS');
  }
  if ((attachmentPaths?.length ?? 0) + (inlineAttachments?.length ?? 0) > MeetingRoomLimits.AttachmentsMax) {
    throw new Error('MEETING_TOO_MANY_ATTACHMENTS');
  }
  return {
    title: title || generateMeetingTitle(topic),
    topic,
    mode: input.mode,
    totalRounds: input.totalRounds!,
    participants,
    attachmentPaths: attachmentPaths?.map(filePath => {
      if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('MEETING_INVALID_ATTACHMENT');
      return path.resolve(filePath.trim());
    }),
    inlineAttachments: inlineAttachments?.map(attachment => {
      if (!attachment || typeof attachment !== 'object') throw new Error('MEETING_INVALID_ATTACHMENT');
      const originalName = typeof attachment.originalName === 'string' ? path.basename(attachment.originalName.trim()) : '';
      const mimeType = typeof attachment.mimeType === 'string' ? attachment.mimeType.trim().toLowerCase() : '';
      const base64Data = typeof attachment.base64Data === 'string' ? attachment.base64Data.trim() : '';
      if (!originalName || !mimeType || !base64Data) throw new Error('MEETING_INVALID_ATTACHMENT');
      return { originalName, mimeType, base64Data };
    }),
  };
};

export const validateMeetingSupplement = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('MEETING_INVALID_SUPPLEMENT');
  const supplement = value.trim();
  if (!supplement) throw new Error('MEETING_SUPPLEMENT_REQUIRED');
  if (supplement.length > MeetingRoomLimits.Supplement) throw new Error('MEETING_SUPPLEMENT_TOO_LONG');
  return supplement;
};

const detectImageFormat = (header: Buffer): MeetingImageFormat | null => {
  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return MeetingImageFormat.Png;
  }
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return MeetingImageFormat.Jpeg;
  }
  if (header.length >= 6 && (header.subarray(0, 6).toString('ascii') === 'GIF87a'
    || header.subarray(0, 6).toString('ascii') === 'GIF89a')) {
    return MeetingImageFormat.Gif;
  }
  if (header.length >= 12 && header.subarray(0, 4).toString('ascii') === 'RIFF'
    && header.subarray(8, 12).toString('ascii') === 'WEBP') {
    return MeetingImageFormat.Webp;
  }
  return null;
};

export const validateMeetingAttachment = (filePath: string): ValidatedMeetingAttachment => {
  const sourcePath = path.resolve(filePath);
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > COWORK_IMAGE_ATTACHMENT_MAX_BYTES) {
    throw new Error('MEETING_INVALID_ATTACHMENT_SIZE');
  }
  const extension = path.extname(sourcePath).toLowerCase();
  const declared = imageByExtension[extension];
  if (!declared) throw new Error('MEETING_INVALID_ATTACHMENT_EXTENSION');
  const descriptor = fs.openSync(sourcePath, 'r');
  try {
    const header = Buffer.alloc(16);
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    const detected = detectImageFormat(header.subarray(0, bytesRead));
    if (detected !== declared.format) throw new Error('MEETING_INVALID_ATTACHMENT_HEADER');
  } finally {
    fs.closeSync(descriptor);
  }
  return {
    sourcePath,
    originalName: path.basename(sourcePath),
    mimeType: declared.mimeType,
    extension,
    sizeBytes: stat.size,
  };
};

export const validateMeetingInlineAttachment = (
  attachment: MeetingRoomInlineAttachmentInput,
): ValidatedMeetingInlineAttachment => {
  const originalName = path.basename(attachment.originalName);
  const extension = path.extname(originalName).toLowerCase();
  const declared = imageByExtension[extension];
  if (!declared || declared.mimeType !== attachment.mimeType.toLowerCase()) {
    throw new Error('MEETING_INVALID_ATTACHMENT_MIME');
  }
  if (attachment.base64Data.length > Math.ceil(COWORK_IMAGE_ATTACHMENT_MAX_BYTES * 4 / 3) + 8) {
    throw new Error('MEETING_INVALID_ATTACHMENT_SIZE');
  }
  const buffer = Buffer.from(attachment.base64Data, 'base64');
  if (buffer.length <= 0 || buffer.length > COWORK_IMAGE_ATTACHMENT_MAX_BYTES) {
    throw new Error('MEETING_INVALID_ATTACHMENT_SIZE');
  }
  if (buffer.toString('base64').replace(/=+$/u, '') !== attachment.base64Data.replace(/\s+/gu, '').replace(/=+$/u, '')) {
    throw new Error('MEETING_INVALID_ATTACHMENT_ENCODING');
  }
  if (detectImageFormat(buffer.subarray(0, 16)) !== declared.format) {
    throw new Error('MEETING_INVALID_ATTACHMENT_HEADER');
  }
  return {
    sourcePath: '',
    originalName,
    mimeType: declared.mimeType,
    extension,
    sizeBytes: buffer.length,
    buffer,
  };
};
