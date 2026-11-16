import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { isInternalUserId } from '../src/domain/model/user-id.js';

test('hardening review keeps email and dev-user out of authorization', () => {
  const handler = readFileSync('src/adapters/inbound/http/handler.ts', 'utf8');
  const principal = readFileSync('src/domain/model/principal.ts', 'utf8');
  expect(handler).toContain("throw new AppError('unauthorized', 401)");
  expect(handler).not.toMatch(/claims\.email/);
  expect(principal).not.toMatch(/email.*userId/);
  expect(isInternalUserId('dev-user')).toBe(false);
});
