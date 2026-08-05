import dayjs from 'dayjs';

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = dayjs(value);
  return date.isValid() ? date.format('YYYY-MM-DD HH:mm') : value;
}

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = dayjs(value);
  return date.isValid() ? date.format('YYYY-MM-DD') : value;
}

export function formatRelativeStatus(
  online: boolean | undefined,
  lastSeenAt?: string | null,
): { label: string; color: 'success' | 'default' } {
  if (online) return { label: '在线', color: 'success' };
  if (!lastSeenAt) return { label: '离线', color: 'default' };
  return { label: '离线', color: 'default' };
}

export function formatPhone(value?: string | null): string {
  return value || '-';
}

export function isRecentlyOnline(value?: string | null, windowMs = 10 * 60 * 1000): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= windowMs;
}

export function maskIdentifier(value?: string | null): string {
  if (!value) return '-';
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function escapeCsvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadCsv(
  filename: string,
  rows: Array<Record<string, unknown>>,
  headers: string[],
): void {
  const csv = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvCell(row[header])).join(','),
    ),
  ].join('\r\n');
  downloadText(filename, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}

export function downloadText(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function normalizeGeneratedKeys(
  keys: Array<{ code: string } | string>,
): Array<{ code: string }> {
  return keys.map((key) => (typeof key === 'string' ? { code: key } : key));
}
