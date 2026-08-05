import { MeetingAttemptStatus } from '../../shared/meetingRoom/constants';
import type { MeetingRoomDto, MeetingTurnDto } from '../../shared/meetingRoom/types';

const formatTime = (timestamp: number | null): string =>
  timestamp ? new Date(timestamp).toISOString() : '-';

const formatTokens = (input: number | null, output: number | null): string =>
  `input=${input ?? 'N/A'}, output=${output ?? 'N/A'}`;

const turnHeading = (turn: MeetingTurnDto): string =>
  `Round ${turn.round} · ${turn.actorName} · ${turn.kind} · ${turn.status}`;

export const exportMeetingMarkdown = (meeting: MeetingRoomDto): string => {
  const lines = [
    `# ${meeting.title}`,
    '',
    `- Topic: ${meeting.topic}`,
    `- Mode: ${meeting.mode}`,
    `- Status: ${meeting.status}`,
    `- Created: ${formatTime(meeting.createdAt)}`,
    `- Started: ${formatTime(meeting.startedAt)}`,
    `- Completed: ${formatTime(meeting.completedAt)}`,
    `- Rounds: ${meeting.currentRound}/${meeting.totalRounds}`,
    '',
    '## Participants',
    '',
    ...meeting.participants.map(participant => (
      `- ${participant.name} (${participant.model || 'default model'})`
      + `${participant.roleNote ? ` — ${participant.roleNote}` : ''}`
    )),
    '',
    '## Attachments',
    '',
    ...(meeting.attachments.length
      ? meeting.attachments.map(attachment => (
          `- ${attachment.originalName} · ${attachment.mimeType} · ${attachment.sizeBytes} bytes`
        ))
      : ['- None']),
    '',
    '## Discussion',
    '',
  ];
  for (const turn of meeting.turns) {
    lines.push(
      `### ${turnHeading(turn)}`,
      '',
      turn.content || turn.error || '_No content_',
      '',
      `Tokens: ${formatTokens(turn.inputTokens, turn.outputTokens)}`,
      '',
    );
    if (turn.attempts.length > 1 || turn.attempts.some(attempt => attempt.status !== MeetingAttemptStatus.Completed)) {
      lines.push('Attempts:', '');
      for (const attempt of turn.attempts) {
        lines.push(
          `- #${attempt.attemptNumber} ${attempt.status}`
          + `${attempt.toolViolation ? ' · tool violation' : ''}`
          + `${attempt.timeout ? ' · timeout' : ''}`
          + `${attempt.userAborted ? ' · user aborted' : ''}`
          + `${attempt.error ? ` · ${attempt.error}` : ''}`,
        );
      }
      lines.push('');
    }
  }
  lines.push('## Final Summary', '', meeting.finalSummary || '_No final summary_', '');
  const tokenTotals = meeting.turns.reduce((total, turn) => ({
    input: total.input + (turn.inputTokens ?? 0),
    output: total.output + (turn.outputTokens ?? 0),
  }), { input: 0, output: 0 });
  lines.push(`Total tokens: input=${tokenTotals.input}, output=${tokenTotals.output}`, '');
  return lines.join('\n');
};

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const paragraphHtml = (value: string): string =>
  escapeHtml(value).replace(/\r?\n/g, '<br>');

export const exportMeetingHtml = (meeting: MeetingRoomDto): string => {
  const participantItems = meeting.participants.map(participant => (
    `<li><strong>${escapeHtml(participant.name)}</strong> (${escapeHtml(participant.model || 'default model')})`
    + `${participant.roleNote ? ` — ${escapeHtml(participant.roleNote)}` : ''}</li>`
  )).join('');
  const attachmentItems = meeting.attachments.length
    ? meeting.attachments.map(attachment => (
        `<li>${escapeHtml(attachment.originalName)} · ${escapeHtml(attachment.mimeType)} · ${attachment.sizeBytes} bytes</li>`
      )).join('')
    : '<li>None</li>';
  const turns = meeting.turns.map(turn => {
    const attempts = turn.attempts.length > 1 || turn.attempts.some(attempt => attempt.status !== MeetingAttemptStatus.Completed)
      ? `<ul>${turn.attempts.map(attempt => (
          `<li>#${attempt.attemptNumber} ${escapeHtml(attempt.status)}`
          + `${attempt.toolViolation ? ' · tool violation' : ''}`
          + `${attempt.timeout ? ' · timeout' : ''}`
          + `${attempt.userAborted ? ' · user aborted' : ''}`
          + `${attempt.error ? ` · ${escapeHtml(attempt.error)}` : ''}</li>`
        )).join('')}</ul>`
      : '';
    return `<section><h3>${escapeHtml(turnHeading(turn))}</h3>`
      + `<p>${paragraphHtml(turn.content || turn.error || 'No content')}</p>`
      + `<p class="tokens">Tokens: ${escapeHtml(formatTokens(turn.inputTokens, turn.outputTokens))}</p>`
      + attempts
      + '</section>';
  }).join('');
  const tokenTotals = meeting.turns.reduce((total, turn) => ({
    input: total.input + (turn.inputTokens ?? 0),
    output: total.output + (turn.outputTokens ?? 0),
  }), { input: 0, output: 0 });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meeting.title)}</title>
<style>
body{max-width:900px;margin:40px auto;padding:0 24px;font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;color:#171717;background:#fff}h1,h2,h3{line-height:1.25}h1{border-bottom:2px solid #171717;padding-bottom:12px}section{border-top:1px solid #ddd;padding:16px 0}.meta{color:#555}.tokens{font-size:13px;color:#666}ul{padding-left:22px}@media(prefers-color-scheme:dark){body{color:#eee;background:#151515}h1{border-color:#eee}section{border-color:#444}.meta,.tokens{color:#aaa}}
</style>
</head>
<body>
<h1>${escapeHtml(meeting.title)}</h1>
<p>${paragraphHtml(meeting.topic)}</p>
<p class="meta">Mode: ${escapeHtml(meeting.mode)} · Status: ${escapeHtml(meeting.status)} · Created: ${escapeHtml(formatTime(meeting.createdAt))} · Rounds: ${meeting.currentRound}/${meeting.totalRounds}</p>
<h2>Participants</h2><ul>${participantItems}</ul>
<h2>Attachments</h2><ul>${attachmentItems}</ul>
<h2>Discussion</h2>${turns}
<h2>Final Summary</h2><p>${paragraphHtml(meeting.finalSummary || 'No final summary')}</p>
<p class="tokens">Total tokens: input=${tokenTotals.input}, output=${tokenTotals.output}</p>
</body>
</html>`;
};
