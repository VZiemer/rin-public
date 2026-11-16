import { expect, test, vi } from 'vitest';
import { DynamoDbRelationshipRepository } from '../src/adapters/outbound/dynamodb/context-repositories.js';
import type { DocumentClient } from '../src/adapters/outbound/dynamodb/store.js';
import type { RelationshipConfig } from '../src/domain/model/contracts.js';

function config(assistant: string): RelationshipConfig {
  return {
    userId: 'u',
    assistant,
    relationship: [`rel-${assistant}`],
    externalCommunication: [],
    createdAt: 'now',
    updatedAt: 'now',
  };
}

test('stores distinct relationship configs per assistant for the same user', async () => {
  const items = new Map<string, Record<string, unknown>>();
  const send = vi.fn(async (command: { input: Record<string, unknown> }) => {
    const name = command.constructor.name;
    const input = command.input;
    if (name === 'PutCommand') {
      const item = input.Item as Record<string, unknown>;
      items.set(`${item.PK}#${item.SK}`, item);
      return {};
    }
    const key = input.Key as { PK: string; SK: string };
    return { Item: items.get(`${key.PK}#${key.SK}`) };
  });
  const repo = new DynamoDbRelationshipRepository({ send } as DocumentClient, 'data');

  await repo.put(config('RIN'));
  await repo.put(config('YUI'));

  expect(send.mock.calls[0]?.[0].input.Item).toMatchObject({
    PK: 'USER#u',
    SK: 'RELATIONSHIP_CONFIG#RIN',
    assistant: 'RIN',
  });
  expect(send.mock.calls[1]?.[0].input.Item).toMatchObject({
    PK: 'USER#u',
    SK: 'RELATIONSHIP_CONFIG#YUI',
    assistant: 'YUI',
  });

  expect((await repo.get('u', 'RIN'))?.relationship).toEqual(['rel-RIN']);
  expect((await repo.get('u', 'YUI'))?.relationship).toEqual(['rel-YUI']);
  expect((await repo.get('u'))?.assistant).toBe('RIN');
});
