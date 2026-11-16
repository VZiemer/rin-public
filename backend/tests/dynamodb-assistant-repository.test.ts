import { expect, test } from 'vitest';
import { DynamoDbAssistantRepository } from '../src/adapters/outbound/dynamodb/assistant-repository.js';
import { assistantKey } from '../src/adapters/outbound/dynamodb/mapping.js';
import type { DocumentClient } from '../src/adapters/outbound/dynamodb/store.js';
import { assistantRepositoryContract } from './assistant-repository.contract.js';

class MemoryDocumentClient implements DocumentClient {
  constructor(private readonly items = new Map<string, Record<string, unknown>>()) {}

  async send(command: { input: Record<string, unknown> }) {
    const input = command.input;
    const name = command.constructor.name;
    if (name === 'PutCommand') {
      const item = input.Item as Record<string, unknown>;
      this.items.set(`${item.PK}#${item.SK}`, item);
      return {};
    }
    if (name === 'GetCommand') {
      const key = input.Key as { PK: string; SK: string };
      return { Item: this.items.get(`${key.PK}#${key.SK}`) };
    }
    if (name === 'ScanCommand') {
      return {
        Items: [...this.items.values()].filter(
          (item) => item.entityType === 'ASSISTANT' && item.enabled === true,
        ),
      };
    }
    throw new Error(`Unsupported command ${name}`);
  }
}

assistantRepositoryContract(
  () => new DynamoDbAssistantRepository(new MemoryDocumentClient(), 'data'),
);

test('persists assistant definitions outside user partitions', async () => {
  const client = new MemoryDocumentClient();
  const repo = new DynamoDbAssistantRepository(client, 'data');
  await repo.put({
    id: 'RIN',
    name: 'Rin',
    description: 'Tsundere friend',
    defaultAvatarState: 'NEUTRAL',
    personaRef: 'rin-persona',
    enabled: true,
  });
  expect(assistantKey('RIN')).toEqual({ PK: 'ASSISTANT#RIN', SK: 'CONFIG' });
  expect(await repo.getById('RIN')).toMatchObject({ id: 'RIN', name: 'Rin' });
});
