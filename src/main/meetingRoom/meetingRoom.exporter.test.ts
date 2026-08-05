import { describe, expect, test } from 'vitest';

import {
  MeetingAttemptStatus,
  MeetingRoomMode,
  MeetingRoomStatus,
  MeetingTurnKind,
  MeetingTurnStatus,
} from '../../shared/meetingRoom/constants';
import type { MeetingRoomDto } from '../../shared/meetingRoom/types';
import { exportMeetingHtml, exportMeetingMarkdown } from './exporter';

const meeting: MeetingRoomDto = {
  id: 'public-id',
  title: 'Review <script>alert(1)</script>',
  topic: 'Topic <img src=x onerror=alert(1)>',
  mode: MeetingRoomMode.ExpertPanel,
  status: MeetingRoomStatus.Completed,
  totalRounds: 1,
  currentRound: 1,
  pauseReason: null,
  participants: [{
    id: 'participant-id',
    agentId: 'agent-id',
    name: 'Reviewer & Owner',
    avatar: '',
    model: 'safe-model',
    supportsVision: true,
    roleNote: 'Check "unsafe" assumptions',
    order: 0,
  }],
  updatedAt: 3,
  version: 4,
  currentStep: null,
  currentTurnId: null,
  finalSummary: '## Summary\nShip safely.',
  attachments: [{
    id: 'attachment-id',
    originalName: 'diagram<script>.png',
    mimeType: 'image/png',
    sizeBytes: 128,
    order: 0,
  }],
  turns: [{
    id: 'turn-id',
    round: 1,
    order: 0,
    kind: MeetingTurnKind.Participant,
    actorParticipantId: 'participant-id',
    actorName: 'Reviewer & Owner',
    status: MeetingTurnStatus.Skipped,
    content: '',
    error: 'Second attempt failed',
    inputTokens: 20,
    outputTokens: 5,
    startedAt: 1,
    completedAt: 2,
    attempts: [
      {
        id: 'attempt-1',
        attemptNumber: 1,
        status: MeetingAttemptStatus.Failed,
        streamingContent: 'partial',
        error: 'Tool violation',
        toolViolation: true,
        timeout: false,
        userAborted: false,
        inputTokens: null,
        outputTokens: null,
        startedAt: 1,
        completedAt: 1,
      },
      {
        id: 'attempt-2',
        attemptNumber: 2,
        status: MeetingAttemptStatus.Failed,
        streamingContent: '',
        error: 'Second attempt failed',
        toolViolation: false,
        timeout: true,
        userAborted: false,
        inputTokens: null,
        outputTokens: null,
        startedAt: 1,
        completedAt: 2,
      },
    ],
  }],
  createdAt: 1,
  startedAt: 1,
  completedAt: 3,
  allModelsLackVision: false,
};

describe('meetingRoom exporters', () => {
  test('exports complete Markdown metadata, retry audit, tokens, and final summary', () => {
    const markdown = exportMeetingMarkdown(meeting);
    expect(markdown).toContain('# Review <script>alert(1)</script>');
    expect(markdown).toContain('Reviewer & Owner');
    expect(markdown).toContain('diagram<script>.png · image/png · 128 bytes');
    expect(markdown).toContain('#1 failed · tool violation');
    expect(markdown).toContain('#2 failed · timeout');
    expect(markdown).toContain('Total tokens: input=20, output=5');
    expect(markdown).toContain('## Final Summary');
    expect(markdown).not.toContain('systemPrompt');
    expect(markdown).not.toContain('hiddenSession');
  });

  test('exports standalone static HTML with all meeting content escaped', () => {
    const html = exportMeetingHtml(meeting);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toMatch(/<script(?:\s|>)/iu);
    expect(html).not.toMatch(/<img(?:\s|>)/iu);
    expect(html).not.toMatch(/<[^>]+\son[a-z]+\s*=/iu);
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
    expect(html).not.toContain('hiddenSession');
    expect(html).not.toContain('apiKey');
  });
});
