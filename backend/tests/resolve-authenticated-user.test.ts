import { expect, test } from 'vitest';
import { InMemoryAuthIdentityRepository } from '../src/adapters/outbound/memory/auth-identity-repository.js';
import { ResolveAuthenticatedUser } from '../src/application/use-cases/resolve-authenticated-user.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';

const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool';

test('returns the mapped internal user and never falls back to Cognito sub', async () => {
  const identities = new InMemoryAuthIdentityRepository();
  const userId = createInternalUserId();
  await identities.create({
    provider: 'COGNITO',
    issuer,
    subject: 'cognito-sub',
    userId,
    createdAt: '2026-09-23T00:00:00.000Z',
  });
  const resolve = new ResolveAuthenticatedUser(identities);
  expect(
    await resolve.execute({
      provider: 'COGNITO',
      issuer,
      subject: 'cognito-sub',
      claims: { sub: 'cognito-sub', iss: issuer },
    }),
  ).toBe(userId);
  expect(
    await resolve.execute({
      provider: 'COGNITO',
      issuer,
      subject: 'unknown-sub',
      claims: { sub: 'unknown-sub', iss: issuer },
    }),
  ).toBeNull();
});
