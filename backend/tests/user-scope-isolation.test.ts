import { expect, test } from 'vitest';
import { InMemoryDeviceRepository } from '../src/adapters/outbound/memory/device-repository.js';
import { DynamoStore } from '../src/adapters/outbound/dynamodb/store.js';
import { owned } from '../src/adapters/outbound/dynamodb/schemas.js';
import { z } from 'zod';
import { createInternalUserId } from '../src/domain/model/user-id.js';

test('user-owned store operations stay inside USER#{userId}', async () => {
  const items = new Map<string, Record<string, unknown>>();
  const send = async (command: { input: Record<string, unknown> }) => {
    const input = command.input;
    if (input.Item) {
      const item = input.Item as Record<string, string>;
      items.set(`${item.PK}|${item.SK}`, item);
      return {};
    }
    if (input.Key) {
      const key = input.Key as { PK: string; SK: string };
      return { Item: items.get(`${key.PK}|${key.SK}`) };
    }
    if (input.KeyConditionExpression) {
      const pk = (input.ExpressionAttributeValues as { ':pk': string })[':pk'];
      return {
        Items: [...items.values()].filter((item) => item.PK === pk),
      };
    }
    return {};
  };
  const store = new DynamoStore(
    { send } as never,
    'data',
    'TASK',
    owned.extend({ id: z.string(), title: z.string(), status: z.string() }),
  );
  const userA = createInternalUserId();
  const userB = createInternalUserId();
  await store.put({ userId: userA, id: 't1', title: 'A', status: 'active', createdAt: 'n', updatedAt: 'n' }, 't1');
  expect(await store.get(userB, 't1')).toBeNull();
  expect((await store.list(userB)).length).toBe(0);
  expect((await store.get(userA, 't1'))?.userId).toBe(userA);
});

test('in-memory devices cannot be read across users', async () => {
  const repo = new InMemoryDeviceRepository();
  const userA = createInternalUserId();
  const userB = createInternalUserId();
  await repo.put({
    id: 'phone',
    userId: userA,
    platform: 'android',
    pushToken: 'a',
    enabled: true,
    createdAt: 'n',
    updatedAt: 'n',
  });
  expect(await repo.get(userB, 'phone')).toBeNull();
  expect(await repo.getOwnership('phone')).toMatchObject({ ownerUserId: userA });
});
