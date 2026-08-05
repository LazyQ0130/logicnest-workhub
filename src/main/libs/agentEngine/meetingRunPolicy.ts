import {
  CoworkRunPolicy,
  type CoworkRunPolicy as CoworkRunPolicyType,
} from '../../../shared/meetingRoom/constants';

export const getMeetingToolViolationReason = (
  runPolicy: CoworkRunPolicyType,
  toolName: string,
): string | null => {
  if (runPolicy !== CoworkRunPolicy.MeetingDiscussion) return null;
  return `Tool ${toolName || 'Tool'} is forbidden by the meeting_discussion run policy.`;
};
