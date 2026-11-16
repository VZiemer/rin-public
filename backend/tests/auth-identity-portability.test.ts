import { expect, test } from 'vitest';
import { InMemoryAuthIdentityRepository } from '../src/adapters/outbound/memory/auth-identity-repository.js';
import { LinkAuthIdentity } from '../src/application/use-cases/link-auth-identity.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';

test('owned records stay on the internal user after a trusted identity change', async () => {
  const identities = new InMemoryAuthIdentityRepository();
  const userId = createInternalUserId();
  const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_old';
  const nextIssuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_new';
  await identities.create({
    provider: 'COGNITO',
    issuer,
    subject: 'old-sub',
    userId,
    createdAt: '2026-09-23T00:00:00.000Z',
  });
  const owned = {
    tasks: ['keep-task'],
    reminders: ['keep-reminder'],
    devices: ['phone'],
    memories: ['keep-fact'],
    relationships: ['RIN'],
  };
  await new LinkAuthIdentity(identities, { now: () => new Date() }).execute({
    userId,
    provider: 'COGNITO',
    issuer: nextIssuer,
    subject: 'new-sub',
  });
  expect(await identities.findUserId('COGNITO', issuer, 'old-sub')).toBe(userId);
  expect(await identities.findUserId('COGNITO', nextIssuer, 'new-sub')).toBe(userId);
  expect(userId).not.toBe('old-sub');
  expect(userId).not.toBe('new-sub');
  expect(owned.tasks).toEqual(['keep-task']);
  expect(owned.reminders).toEqual(['keep-reminder']);
  expect(owned.devices).toEqual(['phone']);
  expect(owned.memories).toEqual(['keep-fact']);
  expect(owned.relationships).toEqual(['RIN']);
});
