import { expect, test, vi } from 'vitest';
import { UpdateWorkingMemory } from '../src/application/use-cases/working-memory.js';
import { DynamoDbWorkingMemoryRepository } from '../src/adapters/outbound/dynamodb/working-memory-repository.js';
import type { DocumentClient } from '../src/adapters/outbound/dynamodb/store.js';
test('stores bounded exact recent exchanges with TTL without waiting for a model summary', async () => {
  const put = vi.fn();
  const summarize = vi.fn(async () => 'Decision: call tomorrow');
  const clock = { now: () => new Date('2026-01-01') };
  await new UpdateWorkingMemory(
    { get: async () => null, put, lastActivityAt: async () => null },
    { summarize },
    clock,
  ).execute('u', 'c', 'raw input', 'raw reply');
  expect(put.mock.calls[0]?.[0]).toMatchObject({
    conversationId: 'c',
    assistantId: 'RIN',
    summary: '',
    recentTurns: [
      { message: 'raw input', reply: 'raw reply', occurredAt: clock.now().toISOString() },
    ],
    expiresAt: 1767312000,
  });
  expect(summarize).not.toHaveBeenCalled();
  const repo = new DynamoDbWorkingMemoryRepository(
    {
      send: vi.fn().mockResolvedValue({
        Item: {
          userId: 'u',
          conversationId: 'c',
          summary: 'old',
          createdAt: 'now',
          updatedAt: 'now',
          expiresAt: 1,
        },
      }),
    } as DocumentClient,
    'data',
    clock,
  );
  expect(await repo.get('u', 'c')).toBeNull();
});
