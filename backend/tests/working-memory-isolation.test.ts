import { expect, test, vi } from 'vitest';
import { DynamoDbWorkingMemoryRepository } from '../src/adapters/outbound/dynamodb/working-memory-repository.js';
import type { DocumentClient } from '../src/adapters/outbound/dynamodb/store.js';

test('working memory is isolated by assistant and shared user data is untouched', async () => {
  const items = new Map<string, Record<string, unknown>>();
  const send = vi.fn(async (command: { input: Record<string, unknown> }) => {
    const name = command.constructor.name;
    const input = command.input;
    if (name === 'PutCommand') {
      const item = input.Item as Record<string, unknown>;
      items.set(`${item.PK}#${item.SK}`, item);
      return {};
    }
    if (name === 'GetCommand') {
      const key = input.Key as { PK: string; SK: string };
      return { Item: items.get(`${key.PK}#${key.SK}`) };
    }
    return { Items: [...items.values()] };
  });
  const repo = new DynamoDbWorkingMemoryRepository({ send } as DocumentClient, 'data', {
    now: () => new Date('2026-01-02T00:00:00Z'),
  });
  const base = {
    userId: 'u',
    conversationId: 'chat',
    summary: 'Rin remembered a private joke',
    createdAt: 'now',
    updatedAt: 'now',
    expiresAt: 2_000_000_000,
  };
  await repo.put({ ...base, assistantId: 'RIN' });
  expect(send.mock.calls[0]?.[0].input.Item).toMatchObject({
    PK: 'USER#u',
    SK: 'WORKING_MEMORY#RIN#chat',
  });
  expect(await repo.get('u', 'chat', 'RIN')).toMatchObject({ assistantId: 'RIN' });
  expect(await repo.get('u', 'chat', 'YUI')).toBeNull();
});

test('switching assistant starts a fresh working conversation for the same chat id', async () => {
  const items = new Map<string, Record<string, unknown>>();
  const send = vi.fn(async (command: { input: Record<string, unknown> }) => {
    const name = command.constructor.name;
    const input = command.input;
    if (name === 'PutCommand') {
      const item = input.Item as Record<string, unknown>;
      items.set(`${item.PK}#${item.SK}`, item);
      return {};
    }
    if (name === 'GetCommand') {
      const key = input.Key as { PK: string; SK: string };
      return { Item: items.get(`${key.PK}#${key.SK}`) };
    }
    return { Items: [...items.values()] };
  });
  const repo = new DynamoDbWorkingMemoryRepository({ send } as DocumentClient, 'data', {
    now: () => new Date('2026-01-02T00:00:00Z'),
  });
  await repo.put({
    userId: 'u',
    conversationId: 'daily',
    assistantId: 'RIN',
    summary: 'Rin context',
    createdAt: 'now',
    updatedAt: 'now',
    expiresAt: 2_000_000_000,
  });
  await repo.put({
    userId: 'u',
    conversationId: 'daily',
    assistantId: 'YUI',
    summary: 'Yui context',
    createdAt: 'now',
    updatedAt: 'now',
    expiresAt: 2_000_000_000,
  });
  expect((await repo.get('u', 'daily', 'RIN'))?.summary).toBe('Rin context');
  expect((await repo.get('u', 'daily', 'YUI'))?.summary).toBe('Yui context');
});
