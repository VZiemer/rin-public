import { expect, test, vi } from 'vitest';
import {
  DynamoDbPersonaRepository,
  DynamoDbPersonRepository,
} from '../src/adapters/outbound/dynamodb/context-repositories.js';
import type { DocumentClient } from '../src/adapters/outbound/dynamodb/store.js';
test('context repository preserves existing defaults atomically', async () => {
  const send = vi
    .fn()
    .mockRejectedValue(Object.assign(new Error(), { name: 'ConditionalCheckFailedException' }));
  const repo = new DynamoDbPersonaRepository({ send } as DocumentClient, 'data');
  expect(
    await repo.put(
      {
        userId: 'u',
        createdAt: 'now',
        updatedAt: 'now',
        name: 'Rin',
        traits: {},
        core: [],
        behavior: {},
      },
      'insert-missing',
    ),
  ).toBe(false);
  expect(send.mock.calls[0]?.[0].input).toMatchObject({
    ConditionExpression: 'attribute_not_exists(PK)',
    Item: { PK: 'USER#u', SK: 'PERSONA#RIN' },
  });
});
test('queries only the user partition and person prefix', async () => {
  const send = vi.fn().mockResolvedValue({ Items: [] });
  await new DynamoDbPersonRepository({ send } as DocumentClient, 'data').list('u', 2);
  expect(send.mock.calls[0]?.[0].input).toMatchObject({
    ExpressionAttributeValues: { ':pk': 'USER#u', ':prefix': 'PERSON#' },
    Limit: 2,
  });
});
