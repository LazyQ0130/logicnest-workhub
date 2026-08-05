const LOG_PREVIEW_MAX_CHARS = 400;
const MAX_LOG_ARRAY_ITEMS = 10;
const MAX_LOG_OBJECT_KEYS = 20;
const REDACTED_VALUE = '[redacted]';
const CIRCULAR_VALUE = '[circular]';
const TRUNCATED_ITEMS_KEY = '__truncatedItems';
const TRUNCATED_KEYS_KEY = '__truncatedKeys';

export const SENSITIVE_LOG_KEY_PATTERN = /(api[-_]?key|token|secret|password|passphrase|authorization|cookie|credential|private[-_]?key|session|refresh[-_]?token|access[-_]?token)/i;

const SENSITIVE_TEXT_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  replacement: string;
}> = [
  {
    pattern: /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gi,
    replacement: REDACTED_VALUE,
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
    replacement: `Bearer ${REDACTED_VALUE}`,
  },
  {
    pattern: /((?:["']?)(?:[A-Za-z0-9_.-]*(?:api[-_]?key|token|secret|password|passphrase|authorization|cookie|credential|private[-_]?key)[A-Za-z0-9_.-]*)(?:["']?)\s*[:=]\s*)(["']?)([^\s,;"'}]+)/gi,
    replacement: `$1$2${REDACTED_VALUE}`,
  },
] as const;

const TRANSPORT_ERROR_TEXT_PATTERNS = [
  /fetch failed/i,
  /\bECONN(?:ABORTED|REFUSED|RESET)\b/i,
  /\bENOTFOUND\b/i,
  /\bEAI_AGAIN\b/i,
  /\bETIMEDOUT\b/i,
  /network error/i,
  /socket hang up/i,
  /connection refused/i,
  /connection reset/i,
  /timed out/i,
  /certificate/i,
  /tls/i,
] as const;

const ANSI_ESCAPE_PATTERN = /(?:\u001B\][^\u0007]*(?:\u0007|\u001B\\)|\u001B\[[0-?]*[ -/]*[@-~]|\u009B[0-?]*[ -/]*[@-~])/g;

export function stripAnsiControlCharacters(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}

function sanitizeForLogInternal(value: unknown, seen: WeakSet<object>, keyName?: string): unknown {
  if (typeof value === 'string') {
    return SENSITIVE_LOG_KEY_PATTERN.test(keyName || '')
      ? REDACTED_VALUE
      : truncateForLog(redactSensitiveText(stripAnsiControlCharacters(value)));
  }

  if (
    value === null
    || value === undefined
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    const next = value
      .slice(0, MAX_LOG_ARRAY_ITEMS)
      .map((item) => sanitizeForLogInternal(item, seen));
    if (value.length > MAX_LOG_ARRAY_ITEMS) {
      next.push(`${TRUNCATED_ITEMS_KEY}:${value.length - MAX_LOG_ARRAY_ITEMS}`);
    }
    return next;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return CIRCULAR_VALUE;
    }
    seen.add(value);

    const entries = Object.entries(value as Record<string, unknown>);
    const next: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of entries.slice(0, MAX_LOG_OBJECT_KEYS)) {
      next[entryKey] = sanitizeForLogInternal(entryValue, seen, entryKey);
    }
    if (entries.length > MAX_LOG_OBJECT_KEYS) {
      next[TRUNCATED_KEYS_KEY] = entries.length - MAX_LOG_OBJECT_KEYS;
    }
    return next;
  }

  return String(value);
}

export function redactSensitiveText(value: string): string {
  return SENSITIVE_TEXT_PATTERNS.reduce(
    (sanitized, { pattern, replacement }) => sanitized.replace(pattern, replacement),
    value,
  );
}

export function sanitizeForLog(value: unknown): unknown {
  return sanitizeForLogInternal(value, new WeakSet<object>());
}

export function truncateForLog(value: string, maxChars = LOG_PREVIEW_MAX_CHARS): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}…`;
}

export function serializeForLog(value: unknown, maxChars = LOG_PREVIEW_MAX_CHARS): string {
  try {
    const sanitized = sanitizeForLogInternal(value, new WeakSet<object>());
    return truncateForLog(JSON.stringify(sanitized), maxChars);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return truncateForLog(`"[log-serialization-failed:${message}]"`, maxChars);
  }
}

export function sanitizeUrlForLog(value: string): string {
  try {
    const url = new URL(value);
    const hasQuery = Boolean(url.search);
    const hasHash = Boolean(url.hash);
    url.search = '';
    url.hash = '';
    return `${url.href}${hasQuery ? '?[redacted]' : ''}${hasHash ? '#[redacted]' : ''}`;
  } catch {
    return '[invalid-url]';
  }
}

export function looksLikeTransportErrorText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return TRANSPORT_ERROR_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
}
