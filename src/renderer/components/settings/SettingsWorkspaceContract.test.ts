import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

const settingsSource = fs.readFileSync(path.resolve(__dirname, '../Settings.tsx'), 'utf8');

describe('settings workspace window-layer contract', () => {
  test('stays above the Windows titlebar drag and caption layer', () => {
    expect(settingsSource).toContain(
      'overlayClassName="non-draggable fixed inset-0 z-[60] bg-background"',
    );
  });
});
