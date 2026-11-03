import type { ApiFieldIssue } from '@theonetrust/contracts';
import { z } from 'zod';
import { AppError } from './errors.ts';

/**
 * Parses untrusted input with a Zod schema. A top-level object schema is made strict, so unknown fields
 * are rejected rather than silently dropped (a typo or an injected field is a 400, not ignored).
 * Nested objects must be declared with `z.strictObject` so they are strict too.
 * Issues carry the field path and the kind of problem only — never the submitted value.
 */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const strict = schema instanceof z.ZodObject ? schema.strict() : schema;
  const result = strict.safeParse(input);
  if (result.success) return result.data as z.output<T>;
  throw new AppError('VALIDATION_ERROR', toFieldIssues(result.error));
}

export function toFieldIssues(error: z.ZodError): ApiFieldIssue[] {
  const issues: ApiFieldIssue[] = [];
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        issues.push({ path: [...issue.path, key].join('.'), issue: 'unknown_field' });
      }
    } else {
      issues.push({ path: issue.path.join('.') || '(root)', issue: issue.code });
    }
  }
  return issues;
}
