import { describe, expect, test } from 'vitest';

import { getAgentHeaderStickyTopClassName } from './AgentTreeNode';

describe('getAgentHeaderStickyTopClassName', () => {
  test('keeps ordinary task-history agents at the top of the scroll area', () => {
    expect(getAgentHeaderStickyTopClassName('tasks', false)).toBe('top-0');
  });

  test('leaves room for a real section header when one is rendered', () => {
    expect(getAgentHeaderStickyTopClassName('tasks', true)).toBe('top-10');
    expect(getAgentHeaderStickyTopClassName('assistants', false)).toBe('top-10');
  });
});
