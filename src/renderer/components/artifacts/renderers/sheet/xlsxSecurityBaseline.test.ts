import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';

import {
  getSheetFileName,
  isSpreadsheetPreviewSizeAllowed,
  MAX_SPREADSHEET_PREVIEW_BYTES,
  MAX_SPREADSHEET_PREVIEW_ROWS,
} from './excelPreprocess';

describe('SheetJS security baseline', () => {
  test('round-trips multiple worksheets and Chinese cell values', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['姓名', '状态'], ['张三', '正常']]),
      '中文工作表',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['value'], [42]]),
      'Data',
    );

    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const parsed = XLSX.read(bytes, { type: 'array' });

    expect(parsed.SheetNames).toEqual(['中文工作表', 'Data']);
    expect(XLSX.utils.sheet_to_json(parsed.Sheets['中文工作表'], { header: 1 })).toEqual([
      ['姓名', '状态'],
      ['张三', '正常'],
    ]);
    expect(getSheetFileName(undefined, 'C:\\测试目录\\季度报表.xlsx')).toBe('季度报表.xlsx');
  });

  test('reads CSV and legacy XLS exports', () => {
    const csv = XLSX.read('名称,数量\n苹果,3', { type: 'string' });
    expect(XLSX.utils.sheet_to_json(csv.Sheets[csv.SheetNames[0]], { header: 1 })).toEqual([
      ['名称', '数量'],
      ['苹果', 3],
    ]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['旧格式'], ['可读取']]), 'Sheet1');
    const xlsBytes = XLSX.write(workbook, { type: 'array', bookType: 'biff8' });
    const parsed = XLSX.read(xlsBytes, { type: 'array' });
    expect(XLSX.utils.sheet_to_json(parsed.Sheets.Sheet1, { header: 1 })).toEqual([
      ['旧格式'],
      ['可读取'],
    ]);
  });

  test('rejects corrupt ZIP input and does not pollute object prototypes', () => {
    expect(() => XLSX.read(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), { type: 'array' }))
      .toThrow('Unsupported ZIP file');

    const workbook = XLSX.read('__proto__,constructor\npolluted,value', { type: 'string' });
    XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('enforces byte and row ceilings for spreadsheet previews', () => {
    expect(isSpreadsheetPreviewSizeAllowed(MAX_SPREADSHEET_PREVIEW_BYTES)).toBe(true);
    expect(isSpreadsheetPreviewSizeAllowed(MAX_SPREADSHEET_PREVIEW_BYTES + 1)).toBe(false);
    expect(isSpreadsheetPreviewSizeAllowed(-1)).toBe(false);

    const rows = Array.from({ length: MAX_SPREADSHEET_PREVIEW_ROWS + 20 }, (_, index) => [index]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Rows');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const parsed = XLSX.read(bytes, { type: 'array', sheetRows: MAX_SPREADSHEET_PREVIEW_ROWS });
    const range = XLSX.utils.decode_range(parsed.Sheets.Rows['!ref'] ?? 'A1');
    expect(range.e.r + 1).toBe(MAX_SPREADSHEET_PREVIEW_ROWS);
  });
});
