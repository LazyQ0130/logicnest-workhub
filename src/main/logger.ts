/**
 * Logger module using electron-log
 * Intercepts console.* methods and writes to file + console simultaneously.
 *
 * Log file locations:
 *   macOS:   ~/Library/Logs/LobsterAI/main-YYYY-MM-DD.log
 *   Windows: %APPDATA%\逻栖工枢\logs\main-YYYY-MM-DD.log
 *   Linux:   ~/.config/逻栖工枢/logs/main-YYYY-MM-DD.log
 *
 * Rotation policy:
 *   - Daily log files (one file per calendar day)
 *   - Max 10 MB per file; on overflow electron-log rotates to .old.log
 *   - Files older than 7 days are pruned on startup
 */

import log from 'electron-log/main';
import fs from 'fs';
import path from 'path';

import { APP_NAME } from './appConstants';
import { ProcessConsoleStream, ProcessStreamHealth } from './libs/processStreamSafety';
import { sanitizeForLog } from './libs/sanitizeForLog';

const LOG_RETENTION_DAYS = 7;
const LOG_MAX_SIZE = 10 * 1024 * 1024;

/** Captured on first resolvePathFn call; used for pruning and export. */
let _logDir: string | undefined;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function logDir(): string {
  return _logDir ?? path.dirname(log.transports.file.getFile().path);
}

/**
 * Initialize logging system.
 * Must be called early in main process, before any console output.
 */
export function initLogger(): void {
  // Daily rotation: one file per calendar day
  log.transports.file.resolvePathFn = (vars) => {
    _logDir = vars.libraryDefaultDir;
    return path.join(vars.libraryDefaultDir, `main-${todayStr()}.log`);
  };

  // File transport config
  log.transports.file.level = 'debug';
  log.transports.file.maxSize = LOG_MAX_SIZE;
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

  // Console transport config
  log.transports.console.level = 'debug';
  log.transports.console.format = '{text}';

  // Intercept console.* methods so all existing console.log/error/warn
  // across 25+ files are automatically captured without any code changes.
  // electron-log correctly serializes Error objects (with stack traces),
  // unlike JSON.stringify which outputs '{}' for Error instances.
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  const streamHealth = new ProcessStreamHealth();

  const reportStreamError = (stream: ProcessConsoleStream, error: unknown): void => {
    if (streamHealth.markError(stream, error)) {
      log.warn(`[Logger] ${stream} closed with EPIPE; console forwarding is disabled for this process.`);
      return;
    }
    if (streamHealth.canWrite(stream)) {
      log.error(`[Logger] ${stream} emitted an unexpected error.`, sanitizeForLog(error));
    }
  };

  const forwardToConsole = (
    stream: ProcessConsoleStream,
    original: (...args: unknown[]) => void,
    args: unknown[],
  ): void => {
    if (!streamHealth.canWrite(stream)) return;
    try {
      original.apply(console, args);
    } catch (error) {
      reportStreamError(stream, error);
    }
  };

  process.stdout?.on('error', error => reportStreamError(ProcessConsoleStream.Stdout, error));
  process.stderr?.on('error', error => reportStreamError(ProcessConsoleStream.Stderr, error));

  console.log = (...args: any[]) => {
    const safeArgs = args.map(sanitizeForLog);
    forwardToConsole(ProcessConsoleStream.Stdout, originalLog, safeArgs);
    log.info(...safeArgs);
  };
  console.error = (...args: any[]) => {
    const safeArgs = args.map(sanitizeForLog);
    forwardToConsole(ProcessConsoleStream.Stderr, originalError, safeArgs);
    log.error(...safeArgs);
  };
  console.warn = (...args: any[]) => {
    const safeArgs = args.map(sanitizeForLog);
    forwardToConsole(ProcessConsoleStream.Stderr, originalWarn, safeArgs);
    log.warn(...safeArgs);
  };
  console.info = (...args: any[]) => {
    const safeArgs = args.map(sanitizeForLog);
    forwardToConsole(ProcessConsoleStream.Stdout, originalInfo, safeArgs);
    log.info(...safeArgs);
  };
  console.debug = (...args: any[]) => {
    const safeArgs = args.map(sanitizeForLog);
    forwardToConsole(ProcessConsoleStream.Stdout, originalDebug, safeArgs);
    log.debug(...safeArgs);
  };

  // Disable electron-log's own console transport to avoid double printing
  // (we already call originalLog above, so electron-log only needs to write to file)
  log.transports.console.level = false;

  // Remove log files older than retention window
  pruneOldLogs();

  // Log startup marker
  log.info('='.repeat(60));
  log.info(`${APP_NAME} started (${process.platform} ${process.arch})`);
  log.info('='.repeat(60));
}

/** Delete daily main-*.log files whose mtime exceeds the retention window. */
function pruneOldLogs(): void {
  const dir = logDir();
  if (!fs.existsSync(dir)) return;

  const cutoffMs = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const file of fs.readdirSync(dir)) {
    if (!/^main-\d{4}-\d{2}-\d{2}(\.old)?\.log$/.test(file)) continue;
    const filePath = path.join(dir, file);
    try {
      if (fs.statSync(filePath).mtimeMs < cutoffMs) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignore individual failures
    }
  }
}

/**
 * Get today's log file path (for display / open-in-folder).
 */
export function getLogFilePath(): string {
  return log.transports.file.getFile().path;
}

/**
 * Return archive entries for all daily main log files within the last 7 days.
 * Suitable for passing directly to exportLogsZip.
 */
export function getRecentMainLogEntries(): Array<{ archiveName: string; filePath: string }> {
  const dir = logDir();
  if (!fs.existsSync(dir)) return [];

  const cutoffMs = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  return fs.readdirSync(dir)
    .filter((f) => /^main-\d{4}-\d{2}-\d{2}(\.old)?\.log$/.test(f))
    .map((f) => ({ archiveName: f, filePath: path.join(dir, f) }))
    .filter(({ filePath }) => {
      try {
        return fs.statSync(filePath).mtimeMs >= cutoffMs;
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.archiveName.localeCompare(b.archiveName));
}

/**
 * Log instance for direct usage if needed
 */
export { log };
