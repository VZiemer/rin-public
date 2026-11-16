import { expect, test, vi } from 'vitest';
import { rinLiveStateSchema } from '../src/adapters/outbound/dynamodb/schemas.js';
import { DynamoDbRinInitiativeStore } from '../src/adapters/outbound/dynamodb/tick-repositories.js';

test('RIN_STATE created only by the proactive tick (no mood) still parses', () => {
  const parsed = rinLiveStateSchema.parse({
    userId: 'u',
    createdAt: '2026-09-24T10:00:00Z',
    updatedAt: '2026-09-24T10:00:00Z',
    initiative: { lastSentAt: '2026-09-24T10:00:00Z' },
  });
  expect(parsed.mood).toEqual({});
});

test('saveInitiative seeds an empty mood without overwriting an existing one', async () => {
  const send = vi.fn<(command: { input: { UpdateExpression?: string; ExpressionAttributeValues?: Record<string, unknown> } }) => Promise<object>>(async () => ({}));
  await new DynamoDbRinInitiativeStore({ send } as never, 'table').saveInitiative('u', {}, new Date());
  const input = send.mock.calls[0]![0].input;
  expect(input.UpdateExpression).toContain('mood = if_not_exists(mood, :mood)');
  expect(input.ExpressionAttributeValues?.[':mood']).toEqual({});
});
