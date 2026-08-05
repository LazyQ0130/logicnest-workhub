import { describe, expect, test } from 'vitest';

import { OpenClawStartupLogFilter } from './openclawLogFilter';

describe('OpenClaw startup log filter', () => {
  test('keeps each missing optional plugin warning at most once per app startup', () => {
    const filter = new OpenClawStartupLogFilter();
    const warning = '- plugins.entries.acpx: plugin not installed: acpx — install it\n';

    expect(filter.filter(warning)).toBe(warning);
    expect(filter.filter(warning)).toBe('');
    expect(filter.filter('- plugins.entries.other: plugin not installed: other\n')).toContain('other');
  });
});
