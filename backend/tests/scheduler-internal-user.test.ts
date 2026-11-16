import { expect, test } from 'vitest';
import { scheduledUserIdOf } from '../src/application/scheduler/internal-user.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';
import { AppError } from '../src/domain/errors/app-error.js';

test('scheduled work accepts only an internal userId', () => {
  const userId = createInternalUserId();
  const event = { userId, reminderId: 'r1', assistantId: 'RIN' };
  expect(scheduledUserIdOf(event)).toBe(userId);
  expect(() => scheduledUserIdOf({ userId: 'dev-user' })).toThrow(AppError);
  expect(() => scheduledUserIdOf({ userId: 'cognito-sub' })).toThrow(AppError);
  expect(() => scheduledUserIdOf({ userId: 'user@example.com' })).toThrow(AppError);
});
