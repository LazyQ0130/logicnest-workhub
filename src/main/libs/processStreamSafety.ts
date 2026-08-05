export const ProcessConsoleStream = {
  Stdout: 'stdout',
  Stderr: 'stderr',
} as const;

export type ProcessConsoleStream = typeof ProcessConsoleStream[keyof typeof ProcessConsoleStream];

export function isBrokenPipeError(error: unknown): boolean {
  return error instanceof Error && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'EPIPE';
}

export class ProcessStreamHealth {
  private readonly unavailable = new Set<ProcessConsoleStream>();

  public canWrite(stream: ProcessConsoleStream): boolean {
    return !this.unavailable.has(stream);
  }

  /** Returns true only for the first EPIPE observed on a stream. */
  public markError(stream: ProcessConsoleStream, error: unknown): boolean {
    if (!isBrokenPipeError(error) || this.unavailable.has(stream)) return false;
    this.unavailable.add(stream);
    return true;
  }
}
