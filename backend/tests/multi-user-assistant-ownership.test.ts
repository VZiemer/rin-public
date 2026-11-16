import { expect, test } from 'vitest';
import { DEFAULT_ASSISTANT_ID } from '../src/domain/model/assistant-id.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';

test('shared user data stays user-owned while assistant state stays user+assistant scoped', () => {
  const userA = createInternalUserId();
  const userB = createInternalUserId();
  const shared = (userId: string, type: string) => ({ PK: `USER#${userId}`, SK: type });
  const relationship = (userId: string, assistantId: string) => ({
    PK: `USER#${userId}`,
    SK: `RELATIONSHIP_CONFIG#${assistantId}`,
  });
  const memory = (userId: string, assistantId: string, conversationId: string) => ({
    PK: `USER#${userId}`,
    SK: `WORKING_MEMORY#${assistantId}#${conversationId}`,
  });
  expect(shared(userA, 'PROFILE')).not.toEqual(shared(userB, 'PROFILE'));
  expect(shared(userA, 'TASK#1')).not.toEqual(shared(userB, 'TASK#1'));
  expect(relationship(userA, 'RIN')).not.toEqual(relationship(userA, 'YUI'));
  expect(relationship(userA, 'RIN')).not.toEqual(relationship(userB, 'RIN'));
  expect(memory(userA, 'RIN', 'c1')).not.toEqual(memory(userA, 'YUI', 'c1'));
  expect(memory(userA, 'RIN', 'c1')).not.toEqual(memory(userB, 'RIN', 'c1'));
  expect(DEFAULT_ASSISTANT_ID).toBe('RIN');
});
