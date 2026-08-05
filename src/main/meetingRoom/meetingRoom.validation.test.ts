import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';

import {
  CoworkRunPolicy,
  MeetingRoomMode,
} from '../../shared/meetingRoom/constants';
import { getMeetingToolViolationReason } from '../libs/agentEngine/meetingRunPolicy';
import {
  generateMeetingTitle,
  validateMeetingAttachment,
  validateMeetingCreateInput,
  validateMeetingInlineAttachment,
} from './validation';

let activeFilePath: string | null = null;

afterEach(() => {
  if (activeFilePath && fs.existsSync(activeFilePath)) fs.unlinkSync(activeFilePath);
  activeFilePath = null;
});

const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 72, 68, 82]);

describe('meetingRoom validation', () => {
  test('generates a title from the first valid sentence without a model call', () => {
    expect(generateMeetingTitle('  第一项决定。第二项不应进入标题。  ')).toBe('第一项决定。');
    expect(generateMeetingTitle('A'.repeat(60))).toHaveLength(40);
  });

  test('rejects duplicate participants and all bounded input violations', () => {
    const base = {
      topic: 'Topic',
      mode: MeetingRoomMode.Sequential,
      totalRounds: 1,
      participants: [
        { agentId: 'a', roleNote: '' },
        { agentId: 'b', roleNote: '' },
      ],
    };
    expect(validateMeetingCreateInput(base).participants).toHaveLength(2);
    expect(() => validateMeetingCreateInput({
      ...base,
      participants: [{ agentId: 'a', roleNote: '' }, { agentId: 'a', roleNote: '' }],
    })).toThrow('MEETING_DUPLICATE_AGENT');
    expect(() => validateMeetingCreateInput({ ...base, totalRounds: 4 })).toThrow('MEETING_INVALID_ROUNDS');
    expect(() => validateMeetingCreateInput({ ...base, topic: '' })).toThrow('MEETING_TOPIC_REQUIRED');
    expect(() => validateMeetingCreateInput({ ...base, title: 'x'.repeat(121) })).toThrow('MEETING_TITLE_TOO_LONG');
    expect(() => validateMeetingCreateInput({
      ...base,
      participants: [{ agentId: 'a', roleNote: 'x'.repeat(501) }, { agentId: 'b', roleNote: '' }],
    })).toThrow('MEETING_ROLE_NOTE_TOO_LONG');
  });

  test('validates extension, MIME, file header, and a single inline image payload', () => {
    activeFilePath = path.join(os.tmpdir(), `meeting-room-${process.pid}-${Date.now()}.png`);
    fs.writeFileSync(activeFilePath, pngBytes, { flag: 'wx' });
    expect(validateMeetingAttachment(activeFilePath)).toMatchObject({
      mimeType: 'image/png',
      sizeBytes: pngBytes.length,
    });
    const inline = validateMeetingInlineAttachment({
      originalName: 'paste.png',
      mimeType: 'image/png',
      base64Data: pngBytes.toString('base64'),
    });
    expect(inline.buffer.equals(pngBytes)).toBe(true);
    expect(() => validateMeetingInlineAttachment({
      originalName: 'paste.jpg',
      mimeType: 'image/jpeg',
      base64Data: pngBytes.toString('base64'),
    })).toThrow('MEETING_INVALID_ATTACHMENT_HEADER');
    expect(() => validateMeetingInlineAttachment({
      originalName: 'paste.png',
      mimeType: 'image/jpeg',
      base64Data: pngBytes.toString('base64'),
    })).toThrow('MEETING_INVALID_ATTACHMENT_MIME');
  });
});

describe('meetingRoom run policy', () => {
  test('blocks every tool under meeting_discussion while leaving default and plan policies unchanged', () => {
    for (const toolName of ['read', 'rg', 'Get-Content', 'browser', 'exec', 'mcp', 'skill', 'subagent']) {
      expect(getMeetingToolViolationReason(CoworkRunPolicy.MeetingDiscussion, toolName))
        .toContain(`Tool ${toolName} is forbidden`);
    }
    expect(getMeetingToolViolationReason(CoworkRunPolicy.Default, 'exec')).toBeNull();
    expect(getMeetingToolViolationReason(CoworkRunPolicy.Plan, 'read')).toBeNull();
  });
});
