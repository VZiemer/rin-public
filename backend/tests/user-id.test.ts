import { expect, test } from 'vitest';
import {
  assertIndependentFromExternalIdentity,
  createInternalUserId,
  isInternalUserId,
  parseUserId,
  userIdSchema,
} from '../src/domain/model/user-id.js';
import { AppError } from '../src/domain/errors/app-error.js';

test('generates a system-owned UUID independent from Cognito, email, phone and device', () => {
  const userId = createInternalUserId();
  expect(isInternalUserId(userId)).toBe(true);
  expect(userId).toMatch(/^[0-9a-f-]{36}$/);
  expect(userId[14]).toBe('7');
  expect(userId).not.toBe('dev-user');
  expect(() =>
    assertIndependentFromExternalIdentity(userId, {
      subject: 'cognito-sub-abc',
      email: 'user@example.com',
      phone: '+5511999999999',
      deviceId: 'android-test',
    }),
  ).not.toThrow();
});

test('rejects provider subjects, emails and malformed values as internal userId', () => {
  expect(isInternalUserId('dev-user')).toBe(false);
  expect(isInternalUserId('user@example.com')).toBe(false);
  expect(isInternalUserId('USER#abc')).toBe(false);
  expect(isInternalUserId('android-test')).toBe(false);
  expect(() => parseUserId('cognito-sub')).toThrow(AppError);
  expect(() => userIdSchema.parse('not-a-uuid')).toThrow();
  expect(() =>
    assertIndependentFromExternalIdentity('same-id', { subject: 'same-id' }),
  ).toThrow(AppError);
});
