import { describe, expect, test } from 'vitest';

import {
  MeetingRoomMode,
  MeetingRoomStatus,
  MeetingTurnKind,
  MeetingTurnStatus,
} from '../../shared/meetingRoom/constants';
import {
  buildFinalSummaryPrompt,
  buildParticipantPrompt,
  buildParticipantSystemPrompt,
  buildRoundFocusPrompt,
  buildRoundSummaryPrompt,
  MEETING_NO_VISION_NOTICE,
} from './prompts';
import type {
  MeetingParticipantSnapshot,
  MeetingRoomRecord,
  MeetingTurnRecord,
} from './store';

const participant = (id: string, name: string, order: number): MeetingParticipantSnapshot => ({
  id,
  agentId: id,
  name,
  avatar: '',
  model: 'test-model',
  supportsVision: false,
  roleNote: `${name} meeting role`,
  order,
  identity: `${name} original identity`,
  systemPrompt: `${name} original system prompt`,
  hiddenSessionId: `hidden-${id}`,
});

const participants = [participant('p1', 'Alpha', 0), participant('p2', 'Beta', 1)];

const room = (mode: typeof MeetingRoomMode[keyof typeof MeetingRoomMode]): MeetingRoomRecord => ({
  id: 'meeting-1',
  title: 'Test meeting',
  topic: 'Decide the rollout plan.',
  mode,
  status: MeetingRoomStatus.Running,
  totalRounds: 2,
  currentRound: 1,
  hostSessionId: 'host-session',
  hostModel: 'host-model',
  hostSupportsVision: false,
  finalSummary: '',
  currentStep: null,
  currentTurnId: null,
  currentAttemptId: null,
  runEpoch: 1,
  pauseReason: null,
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  startedAt: 1,
  completedAt: null,
});

const turn = (
  kind: typeof MeetingTurnKind[keyof typeof MeetingTurnKind],
  round: number,
  order: number,
  content = '',
  actorParticipantId: string | null = null,
  status: MeetingTurnRecord['status'] = MeetingTurnStatus.Completed,
): MeetingTurnRecord => ({
  id: `${kind}-${round}-${order}`,
  meetingId: 'meeting-1',
  round,
  order,
  kind,
  actorParticipantId,
  status,
  content,
  error: null,
  inputTokens: null,
  outputTokens: null,
  startedAt: 1,
  completedAt: status === MeetingTurnStatus.Completed ? 2 : null,
  createdAt: 1,
  updatedAt: 2,
});

const opening = turn(MeetingTurnKind.HostOpening, 0, 0, 'Opening content');
const firstView = turn(MeetingTurnKind.Participant, 1, 0, 'Alpha confidential idea', 'p1');

describe('meetingRoom participant prompts', () => {
  test('appends a meeting role without replacing frozen identity or system prompt', () => {
    const prompt = buildParticipantSystemPrompt(participants[0]);
    expect(prompt).toContain('Alpha original identity');
    expect(prompt).toContain('Alpha original system prompt');
    expect(prompt).toContain('Alpha meeting role');
    expect(prompt.indexOf('Alpha original identity')).toBeLessThan(prompt.indexOf('Alpha meeting role'));
    expect(prompt).toContain('仅追加，不覆盖原身份');
  });

  test('sequential mode shares only earlier views from the current round', () => {
    const prompt = buildParticipantPrompt({
      room: room(MeetingRoomMode.Sequential),
      participant: participants[1],
      turn: turn(MeetingTurnKind.Participant, 1, 1, '', 'p2', MeetingTurnStatus.Pending),
      turns: [opening, firstView, turn(MeetingTurnKind.Participant, 2, 0, 'Unrelated future view', 'p1')],
      participants,
      hasUnavailableImages: false,
    });
    expect(prompt).toContain('Opening content');
    expect(prompt).toContain('Alpha confidential idea');
    expect(prompt).not.toContain('Unrelated future view');
    expect(prompt).toContain('补充、质疑或澄清');
  });

  test('expert panel emphasizes evidence, assumptions, disagreement, and cross-response', () => {
    const prompt = buildParticipantPrompt({
      room: room(MeetingRoomMode.ExpertPanel),
      participant: participants[1],
      turn: turn(MeetingTurnKind.Participant, 1, 1, '', 'p2', MeetingTurnStatus.Pending),
      turns: [opening, firstView],
      participants,
      hasUnavailableImages: false,
    });
    expect(prompt).toContain('证据、假设与判断');
    expect(prompt).toContain('同意或不同意');
    expect(prompt).toContain('交叉回应');

    const summary = buildRoundSummaryPrompt({
      room: room(MeetingRoomMode.ExpertPanel),
      round: 1,
      turns: [firstView],
      participants,
      hasUnavailableImages: false,
    });
    expect(summary).toContain('明确分歧');
    expect(summary).toContain('下一轮必须聚焦的问题');
  });

  test('fully isolates first-round brainstorm participants', () => {
    const prompt = buildParticipantPrompt({
      room: room(MeetingRoomMode.Brainstorm),
      participant: participants[1],
      turn: turn(MeetingTurnKind.Participant, 1, 1, '', 'p2', MeetingTurnStatus.Pending),
      turns: [opening, firstView],
      participants,
      hasUnavailableImages: false,
    });
    expect(prompt).toContain('第一轮头脑风暴隔离规则');
    expect(prompt).not.toContain('Alpha confidential idea');
  });

  test('shares only the cluster summary and current-round earlier views in later brainstorm rounds', () => {
    const clusterSummary = turn(MeetingTurnKind.RoundSummary, 1, 3, 'Cluster A and Cluster B');
    const currentView = turn(MeetingTurnKind.Participant, 2, 0, 'Combine A with B', 'p1');
    const prompt = buildParticipantPrompt({
      room: room(MeetingRoomMode.Brainstorm),
      participant: participants[1],
      turn: turn(MeetingTurnKind.Participant, 2, 1, '', 'p2', MeetingTurnStatus.Pending),
      turns: [opening, firstView, clusterSummary, currentView],
      participants,
      hasUnavailableImages: false,
    });
    expect(prompt).toContain('上一轮聚类总结');
    expect(prompt).toContain('Cluster A and Cluster B');
    expect(prompt).toContain('Combine A with B');
    expect(prompt).not.toContain('Alpha confidential idea');
    expect(prompt).toContain('组合、筛选并完善创意');
  });

  test('uses the explicit non-vision warning without guessing image contents', () => {
    const prompt = buildParticipantPrompt({
      room: room(MeetingRoomMode.Sequential),
      participant: participants[0],
      turn: turn(MeetingTurnKind.Participant, 1, 0, '', 'p1', MeetingTurnStatus.Pending),
      turns: [opening],
      participants,
      hasUnavailableImages: true,
    });
    expect(prompt).toContain(MEETING_NO_VISION_NOTICE);
    expect(prompt).toContain('不得猜测图片内容');
  });
});

describe('meetingRoom host prompts', () => {
  test('requires all six final-summary headings and bounded output', () => {
    const prompt = buildFinalSummaryPrompt({
      room: room(MeetingRoomMode.Sequential),
      turns: [opening, firstView],
      participants,
      hasUnavailableImages: false,
    });
    for (const heading of ['执行摘要', '主要共识', '关键分歧', '风险与未知项', '建议', '可执行行动项']) {
      expect(prompt).toContain(heading);
    }
    expect(prompt).toContain('2000个中文字符或1200个英文单词');
  });

  test('builds append-round focus from old final summary, supplement, and necessary summary', () => {
    const appendRoom = { ...room(MeetingRoomMode.Sequential), totalRounds: 3 };
    const oldFinal = turn(MeetingTurnKind.FinalSummary, 2, 4, 'Old final summary');
    const supplement = turn(MeetingTurnKind.UserSupplement, 3, -2, 'New customer evidence');
    const previousSummary = turn(MeetingTurnKind.RoundSummary, 2, 3, 'Previous round summary');
    const focusTurn = turn(MeetingTurnKind.RoundFocus, 3, -1, '', null, MeetingTurnStatus.Pending);
    const prompt = buildRoundFocusPrompt({
      room: appendRoom,
      turn: focusTurn,
      turns: [oldFinal, previousSummary, supplement, focusTurn],
      hasUnavailableImages: false,
    });
    expect(prompt).toContain('Old final summary');
    expect(prompt).toContain('New customer evidence');
    expect(prompt).toContain('Previous round summary');
  });
});
