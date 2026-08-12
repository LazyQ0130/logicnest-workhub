import { describe, expect, test } from 'vitest';

import { buildMediaGenerationTurnInstruction } from './mediaGenerationTurnInstruction';

describe('buildMediaGenerationTurnInstruction', () => {
  test('keeps an ordinary image request to exactly one generation call', () => {
    const instruction = buildMediaGenerationTurnInstruction({
      mode: 'image',
      imageModelId: 'image-model',
    });

    expect(instruction).toContain('exactly once with action="generate"');
  });

  test('preserves the media-skill fallback when LobsterAI tools are unavailable', () => {
    const instruction = buildMediaGenerationTurnInstruction(undefined, true);

    expect(instruction).toContain('LogicNest WorkHub media generation tools - NOT AVAILABLE');
    expect(instruction).toContain('You may use it');
  });
});
