import { z } from 'zod';
import { AppError } from '../errors/app-error.js';

/** Default assistant during the single-assistant → multi-assistant migration. */
export const DEFAULT_ASSISTANT_ID = 'RIN';

/**
 * Stable assistant identifiers such as `RIN` or `YUI`.
 * Independent from `userId` and never allowed to contain `#` (DynamoDB key delimiter).
 */
export const assistantIdSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z][A-Z0-9]{1,15}$/, 'Invalid assistant id')
      .refine((value) => !value.includes('#') && !value.startsWith('USER'), {
        message: 'Assistant id must be independent from user identity',
      }),
  );

export type AssistantId = z.infer<typeof assistantIdSchema>;

export function isAssistantId(value: unknown): value is AssistantId {
  return assistantIdSchema.safeParse(value).success;
}

export function parseAssistantId(value: unknown, fallback?: AssistantId): AssistantId {
  const parsed = assistantIdSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (fallback !== undefined) return fallback;
  throw new AppError('ASSISTANT_NOT_FOUND', 404);
}
