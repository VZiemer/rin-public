import { expect, test, vi } from 'vitest';
import { DynamoDbAuthIdentityRepository } from '../src/adapters/outbound/dynamodb/auth-identity-repository.js';
import { InMemoryAuthIdentityRepository } from '../src/adapters/outbound/memory/auth-identity-repository.js';
import { authIdentityLookupKey, authIdentityUserKey } from '../src/adapters/outbound/dynamodb/auth-keys.js';
import type { DocumentClient } from '../src/adapters/outbound/dynamodb/store.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';
import { authIdentityContract } from './auth-identity.contract.js';

authIdentityContract('in-memory auth identity', () => new InMemoryAuthIdentityRepository());

test('dynamo adapter writes lookup and reverse keys without scan or GSI', async () => {
  const userId = createInternalUserId();
  const identity = {
    provider: 'COGNITO' as const,
    issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool',
    subject: 'sub-1',
    userId,
    createdAt: '2026-09-23T00:00:00.000Z',
  };
  const send = vi.fn().mockResolvedValue({});
  const repo = new DynamoDbAuthIdentityRepository({ send } as DocumentClient, 'data');
  expect(await repo.create(identity)).toBe(true);
  const input = send.mock.calls[0]?.[0].input as {
    TransactItems: Array<{ Put: { Item: Record<string, string>; ConditionExpression: string } }>;
  };
  expect(input.TransactItems[0]?.Put.Item).toMatchObject({
    ...authIdentityLookupKey(identity.provider, identity.issuer, identity.subject),
    entityType: 'AUTH_IDENTITY',
    userId,
  });
  expect(input.TransactItems[1]?.Put.Item).toMatchObject({
    ...authIdentityUserKey(userId, identity.provider, identity.issuer, identity.subject),
    entityType: 'AUTH_IDENTITY',
  });
  expect(input.TransactItems.every((item) => item.Put.ConditionExpression.includes('attribute_not_exists'))).toBe(
    true,
  );
  send.mockResolvedValueOnce({ Item: { ...identity, PK: 'AUTH#x', SK: 'IDENTITY', entityType: 'AUTH_IDENTITY' } });
  expect(await repo.findUserId(identity.provider, identity.issuer, identity.subject)).toBe(userId);
  expect(send.mock.calls[1]?.[0].input).toMatchObject({
    Key: authIdentityLookupKey(identity.provider, identity.issuer, identity.subject),
    ConsistentRead: true,
  });
});

test('dynamo adapter treats canceled create as already existing', async () => {
  const error = new Error('canceled');
  error.name = 'TransactionCanceledException';
  const send = vi.fn().mockRejectedValue(error);
  const repo = new DynamoDbAuthIdentityRepository({ send } as DocumentClient, 'data');
  expect(
    await repo.create({
      provider: 'COGNITO',
      issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool',
      subject: 'sub-1',
      userId: createInternalUserId(),
      createdAt: 'now',
    }),
  ).toBe(false);
});
