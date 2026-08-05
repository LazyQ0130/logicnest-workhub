export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ErrorDetails;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details) this.details = details;
  }
}

export const badRequest = (code: string, message: string, details?: ErrorDetails) => new AppError(400, code, message, details);
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Authentication is required') => new AppError(401, code, message);
export const forbidden = (code: string, message: string, details?: ErrorDetails) => new AppError(403, code, message, details);
export const notFound = (code = 'NOT_FOUND', message = 'Resource not found') => new AppError(404, code, message);
export const conflict = (code: string, message: string, details?: ErrorDetails) => new AppError(409, code, message, details);
export const tooManyRequests = (message = 'Too many requests') => new AppError(429, 'RATE_LIMITED', message);

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

export const publicErrorMessage = (error: unknown): string => {
  if (isAppError(error)) return error.message;
  return 'An unexpected error occurred';
};
