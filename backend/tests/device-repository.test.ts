import { expect, test, vi } from 'vitest';
import { DynamoDbDeviceRepository } from '../src/adapters/outbound/dynamodb/device-repository.js';
import type { DocumentClient } from '../src/adapters/outbound/dynamodb/store.js';
test('device keys isolate users and persist global ownership', async () => {
  const send = vi.fn().mockResolvedValue({});
  const repo = new DynamoDbDeviceRepository({ send } as DocumentClient, 'data');
  const device = {
    id: 'phone',
    userId: 'u',
    platform: 'android' as const,
    pushToken: 'private',
    enabled: true,
    createdAt: 'now',
    updatedAt: 'now',
  };
  await repo.put(device);
  expect(send.mock.calls[0]?.[0].input.Key).toEqual({ PK: 'DEVICE#phone', SK: 'CONFIG' });
  const items = send.mock.calls[1]?.[0].input.TransactItems as Array<{
    Put?: { Item: Record<string, string> };
  }>;
  expect(items[0]?.Put?.Item).toMatchObject({ PK: 'DEVICE#phone', SK: 'CONFIG', ownerUserId: 'u' });
  expect(items[1]?.Put?.Item).toMatchObject({ PK: 'USER#u', SK: 'DEVICE#phone' });
  await repo.delete('u', 'phone');
  expect(send.mock.calls.at(-1)?.[0].input.TransactItems).toEqual([
    { Delete: { TableName: 'data', Key: { PK: 'USER#u', SK: 'DEVICE#phone' } } },
    { Delete: { TableName: 'data', Key: { PK: 'DEVICE#phone', SK: 'CONFIG' } } },
  ]);
  await expect(repo.put({ ...device, pushToken: '' })).rejects.toThrow();
});
