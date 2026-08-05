import { AgentAvatarSvg, AgentId, encodeAgentAvatarIcon } from '@shared/agent';
import { describe, expect, test } from 'vitest';

import { shouldUseDefaultAgentIcon } from './agentDisplay';

describe('shouldUseDefaultAgentIcon', () => {
  test('always uses the Work Hub owl for the main agent', () => {
    expect(shouldUseDefaultAgentIcon({ id: AgentId.Main, icon: '' })).toBe(true);
    expect(shouldUseDefaultAgentIcon({
      id: AgentId.Main,
      icon: encodeAgentAvatarIcon({ svg: AgentAvatarSvg.Owl }),
    })).toBe(true);
  });

  test('keeps configured avatars for custom agents', () => {
    expect(shouldUseDefaultAgentIcon({
      id: 'research',
      icon: encodeAgentAvatarIcon({ svg: AgentAvatarSvg.Code }),
    })).toBe(false);
  });
});
