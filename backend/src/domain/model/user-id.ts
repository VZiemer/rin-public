import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[17][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const userIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => UUID_RE.test(value), 'invalid_user_id')
  .refine((value) => !value.includes('#') && !value.includes('@'), 'invalid_user_id');

export type UserId = z.infer<typeof userIdSchema>;

export function createInternalUserId(now = Date.now()): UserId {
  const bytes = randomBytes(16);
  const ms = BigInt(now);
  bytes[0] = Number((ms >> 40n) & 0xffn);
  bytes[1] = Number((ms >> 32n) & 0xffn);
  bytes[2] = Number((ms >> 24n) & 0xffn);
  bytes[3] = Number((ms >> 16n) & 0xffn);
  bytes[4] = Number((ms >> 8n) & 0xffn);
  bytes[5] = Number(ms & 0xffn);
  bytes[6] = (bytes.readUInt8(6) & 0x0f) | 0x70;
  bytes[8] = (bytes.readUInt8(8) & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString('hex');
  return userIdSchema.parse(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  );
}

export function parseUserId(value: unknown): UserId {
  const parsed = userIdSchema.safeParse(value);
  if (!parsed.success) throw new AppError('invalid_user_id', 400);
  return parsed.data;
}

export function isInternalUserId(value: unknown): value is UserId {
  return userIdSchema.safeParse(value).success;
}

export function assertIndependentFromExternalIdentity(
  userId: string,
  external: { subject?: string; email?: string; phone?: string; deviceId?: string },
) {
  const candidates = [external.subject, external.email, external.phone, external.deviceId].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  if (candidates.some((value) => value === userId || value.toLowerCase() === userId)) {
    throw new AppError('invalid_user_id', 400);
  }
}
