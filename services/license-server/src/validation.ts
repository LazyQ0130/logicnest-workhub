import { z } from 'zod';
import { badRequest } from './errors.js';

export const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.reduce<Record<string, string[]>>((acc, issue) => {
      const key = issue.path.join('.') || 'request';
      (acc[key] ??= []).push(issue.message);
      return acc;
    }, {});
    const firstField = result.error.issues[0]?.path[0];
    const code = firstField === 'phone'
      ? 'INVALID_PHONE'
      : firstField === 'licenseKey'
        ? 'INVALID_LICENSE_CODE'
        : 'VALIDATION_ERROR';
    throw badRequest(code, 'Request validation failed', { fields: details });
  }
  return result.data;
};

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const optionalDate = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value;
}, z.coerce.date().optional());

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
