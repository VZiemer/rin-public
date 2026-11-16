import { expect, test, vi } from 'vitest';
import { DynamoDbMemoryRepository } from '../src/adapters/outbound/dynamodb/memory-repository.js';
import type { DocumentClient } from '../src/adapters/outbound/dynamodb/store.js';
import { Memories } from '../src/application/use-cases/memories.js';
test('filters and orders memory across pages before limiting', async () => {
  const item = (id: string, date: string, category = 'preference') => ({
    id,
    userId: 'u',
    createdAt: date,
    updatedAt: date,
    category,
    content: 'fact',
  });
  const send = vi
    .fn()
    .mockResolvedValueOnce({
      Items: [item('a', '2026-01-01')],
      LastEvaluatedKey: { PK: 'USER#u', SK: 'MEMORY#a' },
    })
    .mockResolvedValueOnce({ Items: [item('b', '2026-01-03'), item('c', '2026-01-04', 'other')] });
  const repo = new DynamoDbMemoryRepository({ send } as DocumentClient, 'data');
  expect((await repo.list('u', { category: 'preference', limit: 1 })).map((v) => v.id)).toEqual([
    'b',
  ]);
  expect(send).toHaveBeenCalledTimes(2);
});
test('explicit memory CRUD stores no TTL', async () => {
  const put = vi.fn();
  const service = new Memories(
    { get: async () => null, list: async () => [], put, delete: vi.fn() },
    { now: () => new Date('2026-01-01') },
    { next: () => 'm' },
  );
  const value = await service.create('u', { content: 'Prefers morning', category: 'preference' });
  expect(value).not.toHaveProperty('expiresAt');
  await expect(service.update('u', 'missing', { content: 'x', category: 'fact' })).rejects.toThrow(
    'not_found',
  );
});
