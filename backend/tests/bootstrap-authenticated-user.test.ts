import { expect, test } from 'vitest';
import { InMemoryAuthIdentityRepository } from '../src/adapters/outbound/memory/auth-identity-repository.js';
import { BootstrapAuthenticatedUser } from '../src/application/use-cases/bootstrap-authenticated-user.js';
import { createInternalUserId, isInternalUserId } from '../src/domain/model/user-id.js';
import type { UserProfile } from '../src/domain/model/contracts.js';

test('creates an internal user once and stays idempotent under a race', async () => {
  const identities = new InMemoryAuthIdentityRepository();
  const profiles = new Map<string, UserProfile>();
  const bootstrap = new BootstrapAuthenticatedUser(
    identities,
    {
      get: async (userId) => profiles.get(userId) ?? null,
      put: async (value, mode) => {
        if (mode === 'insert-missing' && profiles.has(value.userId)) return false;
        profiles.set(value.userId, value);
        return true;
      },
    },
    { now: () => new Date('2026-09-23T00:00:00.000Z') },
  );
  const principal = {
    provider: 'COGNITO' as const,
    issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool',
    subject: 'new-sub',
    claims: { sub: 'new-sub', email: 'a@example.com' },
  };
  const first = await bootstrap.execute(principal);
  const second = await bootstrap.execute(principal);
  expect(isInternalUserId(first.userId)).toBe(true);
  expect(first.userId).not.toBe('new-sub');
  expect(first.userId).toBe(second.userId);
  expect(first.defaultAssistantId).toBe('RIN');
  expect(first.profileInitialized).toBe(true);
  expect(await identities.listByUserId(first.userId)).toHaveLength(1);
});

test('returns the winner when another request creates the mapping first', async () => {
  const existing = createInternalUserId();
  const identities = new InMemoryAuthIdentityRepository();
  await identities.create({
    provider: 'COGNITO',
    issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool',
    subject: 'raced-sub',
    userId: existing,
    createdAt: '2026-09-23T00:00:00.000Z',
  });
  const bootstrap = new BootstrapAuthenticatedUser(
    identities,
    { get: async () => null, put: async () => true },
    { now: () => new Date() },
  );
  const result = await bootstrap.execute({
    provider: 'COGNITO',
    issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool',
    subject: 'raced-sub',
    claims: {},
  });
  expect(result.userId).toBe(existing);
});
