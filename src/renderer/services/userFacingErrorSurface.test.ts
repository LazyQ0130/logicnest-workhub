import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('user-visible error surfaces', () => {
  test.each([
    'src/renderer/components/ErrorMessage.tsx',
    'src/renderer/components/auth/LogicNestLicenseGate.tsx',
    'src/renderer/components/auth/LogicNestLockedShell.tsx',
    'src/renderer/components/cowork/AssistantTurnBlock.tsx',
    'src/renderer/components/cowork/EngineFailureOverlay.tsx',
    'src/renderer/components/im/IMSettings.tsx',
    'src/renderer/components/update/appUpdateErrorText.ts',
  ])('%s applies the localized error formatter', (path) => {
    expect(source(path)).toContain('formatUserFacingError');
  });
});
