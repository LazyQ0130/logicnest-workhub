import { describe, expect, it } from 'vitest';
import { escapeCsvCell, formatPhone, normalizeGeneratedKeys } from './format';

describe('admin web formatting helpers', () => {
  it('escapes CSV cells so commas and quotes stay inside one cell', () => {
    expect(escapeCsvCell('LQGX,"quoted"')).toBe('"LQGX,""quoted"""');
    expect(escapeCsvCell(null)).toBe('""');
  });

  it('normalizes one-time generated key responses', () => {
    expect(normalizeGeneratedKeys(['LQGX-ONE', { code: 'LQGX-TWO' }])).toEqual([
      { code: 'LQGX-ONE' },
      { code: 'LQGX-TWO' },
    ]);
  });

  it('keeps the complete phone number visible to administrators', () => {
    expect(formatPhone('+8613800138000')).toBe('+8613800138000');
    expect(formatPhone()).toBe('-');
  });
});
