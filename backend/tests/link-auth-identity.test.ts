import { expect, test } from 'vitest';
import { InMemoryAuthIdentityRepository } from '../src/adapters/outbound/memory/auth-identity-repository.js';
import { LinkAuthIdentity } from '../src/application/use-cases/link-auth-identity.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';
import { AppError } from '../src/domain/errors/app-error.js';

const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool';

test('links a second verified identity to the same internal user and rejects email matching', async () => {
  const identities = new InMemoryAuthIdentityRepository();
  const link = new LinkAuthIdentity(identities, { now: () => new Date('2026-09-23T00:00:00.000Z') });
  const userId = createInternalUserId();
  const other = createInternalUserId();
  await identities.create({
    provider: 'COGNITO',
    issuer,
    subject: 'old-sub',
    userId,
    createdAt: '2026-09-23T00:00:00.000Z',
  });
  expect(await link.execute({ userId, provider: 'COGNITO', issuer, subject: 'new-sub' })).toBe(userId);
  expect(await identities.findUserId('COGNITO', issuer, 'new-sub')).toBe(userId);
  expect(await identities.listByUserId(userId)).toHaveLength(2);
  await expect(link.execute({ userId: other, provider: 'COGNITO', issuer, subject: 'new-sub' })).rejects.toBeInstanceOf(
    AppError,
  );
});
