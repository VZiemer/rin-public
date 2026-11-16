import { expect, test } from 'vitest';
import { agentOutputSchema } from '../src/domain/model/validation.js';

test('push payloads keep assistant identity and remain backward compatible', () => {
  expect(
    agentOutputSchema.parse({
      message: 'oi',
      avatarState: 'SMUG',
      priority: 'NORMAL',
      actions: [],
    }).assistantId,
  ).toBe('RIN');
  expect(
    agentOutputSchema.parse({
      message: 'oi',
      avatarState: 'SOFT_SMILE',
      priority: 'NORMAL',
      actions: [],
      assistantId: 'yui',
    }).assistantId,
  ).toBe('YUI');
});
