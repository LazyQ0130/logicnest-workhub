import {
  MeetingRoomMode,
  MeetingTurnKind,
  MeetingTurnStatus,
} from '../../shared/meetingRoom/constants';
import type { MeetingParticipantSnapshot, MeetingRoomRecord, MeetingTurnRecord } from './store';

export const MEETING_NO_VISION_NOTICE = [
  '本次会议包含图片，但当前模型不支持视觉输入，图片内容不可用。',
  '请仅依据文字议题讨论，不得猜测图片内容。',
].join('\n');

const HOST_IDENTITY = [
  '你是一个中立、严谨的会议主持人。',
  '你不代表任何参与者，不继承 Main Agent 或其他 Agent 的身份。',
  '你只能输出纯文本讨论内容，不得调用任何工具、Skill、Kit、MCP、浏览器、命令、文件操作、媒体生成或子 Agent。',
].join('\n');

const PARTICIPANT_SAFETY = [
  '这是一个受限的会议发言。只能输出纯文本观点。',
  '不得调用工具、Skill、Kit、MCP、浏览器、命令、文件、媒体生成或子 Agent。',
].join('\n');

const completedContent = (turns: MeetingTurnRecord[], kind: string, round?: number): string =>
  turns.find(turn => turn.kind === kind
    && (round === undefined || turn.round === round)
    && turn.status === MeetingTurnStatus.Completed)?.content.trim() ?? '';

const participantIdentity = (participant: MeetingParticipantSnapshot): string => [
  '[冻结的原始身份]',
  participant.identity.trim() || '未提供额外身份说明。',
  participant.systemPrompt.trim() ? `[冻结的原始系统提示]\n${participant.systemPrompt.trim()}` : '',
  participant.roleNote.trim()
    ? `[本次会议角色备注（仅追加，不覆盖原身份）]\n${participant.roleNote.trim()}`
    : '',
].filter(Boolean).join('\n\n');

const formatPriorParticipantViews = (
  turns: MeetingTurnRecord[],
  participants: MeetingParticipantSnapshot[],
  round: number,
  currentOrder: number,
): string => {
  const names = new Map(participants.map(participant => [participant.id, participant.name]));
  return turns
    .filter(turn => turn.kind === MeetingTurnKind.Participant
      && turn.round === round
      && turn.order < currentOrder
      && turn.status === MeetingTurnStatus.Completed)
    .map(turn => `- ${names.get(turn.actorParticipantId ?? '') ?? '参与者'}：${turn.content.trim()}`)
    .join('\n');
};

const getPreviousHostSummary = (turns: MeetingTurnRecord[], round: number): string => {
  if (round <= 1) return '';
  return completedContent(turns, MeetingTurnKind.RoundSummary, round - 1)
    || completedContent(turns, MeetingTurnKind.RoundFocus, round);
};

export const buildHostSystemPrompt = (): string => HOST_IDENTITY;

export const buildParticipantSystemPrompt = (participant: MeetingParticipantSnapshot): string => [
  participantIdentity(participant),
  PARTICIPANT_SAFETY,
].join('\n\n');

export const buildHostOpeningPrompt = (room: MeetingRoomRecord, hasUnavailableImages: boolean): string => [
  '请为本次会议生成简洁的主持开场。必须明确包含：',
  '1. 问题',
  '2. 目标',
  '3. 约束',
  '4. 讨论重点',
  '5. 期望产出',
  `会议模式：${room.mode}`,
  `[议题]\n${room.topic}`,
  hasUnavailableImages ? MEETING_NO_VISION_NOTICE : '',
  '只输出主持开场正文。',
].filter(Boolean).join('\n\n');

export const buildParticipantPrompt = (input: {
  room: MeetingRoomRecord;
  participant: MeetingParticipantSnapshot;
  turn: MeetingTurnRecord;
  turns: MeetingTurnRecord[];
  participants: MeetingParticipantSnapshot[];
  hasUnavailableImages: boolean;
}): string => {
  const { room, participant, turn, turns, participants } = input;
  const opening = completedContent(turns, MeetingTurnKind.HostOpening);
  const previousSummary = getPreviousHostSummary(turns, turn.round);
  const earlierViews = formatPriorParticipantViews(turns, participants, turn.round, turn.order);
  const supplement = completedContent(turns, MeetingTurnKind.UserSupplement, turn.round);
  const sections = [
    `[议题与目标]\n${room.topic}`,
    `[主持开场]\n${opening}`,
    supplement ? `[用户补充意见]\n${supplement}` : '',
  ];

  if (room.mode === MeetingRoomMode.Brainstorm && turn.round === 1) {
    sections.push(
      '[第一轮头脑风暴隔离规则]',
      '你看不到、也不得推测其他参与者的观点。请独立提出尽可能新颖且具体的想法。',
    );
  } else {
    if (previousSummary) {
      sections.push(room.mode === MeetingRoomMode.Brainstorm
        ? `[上一轮聚类总结]\n${previousSummary}`
        : `[上一轮主持总结]\n${previousSummary}`);
    }
    if (earlierViews) sections.push(`[本轮此前参与者观点]\n${earlierViews}`);
  }

  if (room.mode === MeetingRoomMode.Sequential) {
    sections.push('请回应议题，并针对已有观点进行补充、质疑或澄清。');
  } else if (room.mode === MeetingRoomMode.ExpertPanel) {
    sections.push(
      `请以 ${participant.name} 的冻结专业身份发言。`,
      '明确区分证据、假设与判断；点出你同意或不同意的观点，并给出交叉回应。',
    );
  } else if (turn.round > 1) {
    sections.push('基于聚类结果组合、筛选并完善创意，说明价值、可行性和下一步验证方式。');
  }

  sections.push(
    input.hasUnavailableImages ? MEETING_NO_VISION_NOTICE : '',
    '将本次发言控制在约1200个中文字符或800个英文单词以内。只输出发言正文。',
  );
  return sections.filter(Boolean).join('\n\n');
};

export const buildRoundSummaryPrompt = (input: {
  room: MeetingRoomRecord;
  round: number;
  turns: MeetingTurnRecord[];
  participants: MeetingParticipantSnapshot[];
  hasUnavailableImages: boolean;
}): string => {
  const names = new Map(input.participants.map(participant => [participant.id, participant.name]));
  const views = input.turns
    .filter(turn => turn.kind === MeetingTurnKind.Participant
      && turn.round === input.round
      && (turn.status === MeetingTurnStatus.Completed || turn.status === MeetingTurnStatus.Skipped))
    .map(turn => `- ${names.get(turn.actorParticipantId ?? '') ?? '参与者'} [${turn.status}]：${turn.content || turn.error || ''}`)
    .join('\n');
  const modeInstruction = input.room.mode === MeetingRoomMode.Brainstorm
    ? '对创意进行聚类，给出类别、代表想法、可组合项，并提出下一轮筛选与完善重点。'
    : input.room.mode === MeetingRoomMode.ExpertPanel
      ? '总结证据、假设、共识与明确分歧，并给出下一轮必须聚焦的问题。'
      : '总结本轮共识、分歧和仍需澄清的问题，并给出下一轮讨论重点。';
  return [
    `请总结第 ${input.round} 轮讨论。`,
    modeInstruction,
    `[本轮发言]\n${views}`,
    input.hasUnavailableImages ? MEETING_NO_VISION_NOTICE : '',
    '只输出轮间总结正文。',
  ].filter(Boolean).join('\n\n');
};

export const buildRoundFocusPrompt = (input: {
  room: MeetingRoomRecord;
  turn: MeetingTurnRecord;
  turns: MeetingTurnRecord[];
  hasUnavailableImages: boolean;
}): string => {
  const supplement = completedContent(input.turns, MeetingTurnKind.UserSupplement, input.turn.round);
  const lastFinal = [...input.turns]
    .reverse()
    .find(turn => turn.kind === MeetingTurnKind.FinalSummary && turn.status === MeetingTurnStatus.Completed)?.content ?? '';
  const previousSummary = getPreviousHostSummary(input.turns, input.turn.round);
  return [
    '会议已完成过一次总结，用户追加了一轮。请生成这一轮的聚焦问题。',
    `[旧最终总结]\n${lastFinal}`,
    `[用户补充意见]\n${supplement}`,
    previousSummary ? `[必要的上一轮总结]\n${previousSummary}` : '',
    `会议模式：${input.room.mode}`,
    input.hasUnavailableImages ? MEETING_NO_VISION_NOTICE : '',
    '只输出本轮聚焦问题和期望参与者解决的事项。',
  ].filter(Boolean).join('\n\n');
};

export const buildFinalSummaryPrompt = (input: {
  room: MeetingRoomRecord;
  turns: MeetingTurnRecord[];
  participants: MeetingParticipantSnapshot[];
  hasUnavailableImages: boolean;
}): string => {
  const names = new Map(input.participants.map(participant => [participant.id, participant.name]));
  const transcript = input.turns
    .filter(turn => turn.kind !== MeetingTurnKind.FinalSummary
      && (turn.status === MeetingTurnStatus.Completed || turn.status === MeetingTurnStatus.Skipped))
    .map(turn => {
      const actor = turn.actorParticipantId ? names.get(turn.actorParticipantId) ?? '参与者' : '主持人';
      return `[第 ${turn.round} 轮 / ${actor} / ${turn.kind} / ${turn.status}]\n${turn.content || turn.error || ''}`;
    })
    .join('\n\n');
  return [
    '请生成会议最终总结，必须严格使用以下六个标题，顺序不得改变：',
    '## 1. 执行摘要',
    '## 2. 主要共识',
    '## 3. 关键分歧',
    '## 4. 风险与未知项',
    '## 5. 建议',
    '## 6. 可执行行动项',
    `[会议议题]\n${input.room.topic}`,
    `[必要会议记录]\n${transcript}`,
    input.hasUnavailableImages ? MEETING_NO_VISION_NOTICE : '',
    '控制在约2000个中文字符或1200个英文单词以内。不要添加上述六个标题之外的一级结构。',
  ].filter(Boolean).join('\n\n');
};

export const buildPromptForTurn = (input: {
  room: MeetingRoomRecord;
  turn: MeetingTurnRecord;
  turns: MeetingTurnRecord[];
  participants: MeetingParticipantSnapshot[];
  hasUnavailableImages: boolean;
}): string => {
  switch (input.turn.kind) {
    case MeetingTurnKind.HostOpening:
      return buildHostOpeningPrompt(input.room, input.hasUnavailableImages);
    case MeetingTurnKind.RoundFocus:
      return buildRoundFocusPrompt(input);
    case MeetingTurnKind.Participant: {
      const participant = input.participants.find(candidate => candidate.id === input.turn.actorParticipantId);
      if (!participant) throw new Error('MEETING_PARTICIPANT_SNAPSHOT_MISSING');
      return buildParticipantPrompt({ ...input, participant });
    }
    case MeetingTurnKind.RoundSummary:
      return buildRoundSummaryPrompt({ ...input, round: input.turn.round });
    case MeetingTurnKind.FinalSummary:
      return buildFinalSummaryPrompt(input);
    case MeetingTurnKind.UserSupplement:
      return input.turn.content;
  }
};
