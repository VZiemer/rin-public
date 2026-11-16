import { expect, test } from 'vitest';
import { authIdentitySchema, authLookupKey } from '../src/domain/model/auth-identity.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';

const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool';

test('maps provider issuer and subject to one internal user without using email', () => {
  const userId = createInternalUserId();
  const identity = authIdentitySchema.parse({
    provider: 'COGNITO',
    issuer,
    subject: 'cognito-sub-1',
    userId,
    createdAt: '2026-09-23T00:00:00.000Z',
  });
  expect(identity.userId).not.toBe(identity.subject);
  expect(identity).not.toHaveProperty('email');
  expect(authLookupKey('COGNITO', issuer, 'cognito-sub-1')).toEqual({
    provider: 'COGNITO',
    issuer,
    subject: 'cognito-sub-1',
  });
});

test('rejects email-like or hashed identity parts and subject reused as userId', () => {
  const userId = createInternalUserId();
  expect(() =>
    authIdentitySchema.parse({
      provider: 'COGNITO',
      issuer: 'https://example.com#pool',
      subject: 'sub',
      userId,
      createdAt: 'now',
    }),
  ).toThrow();
  expect(() =>
    authIdentitySchema.parse({
      provider: 'COGNITO',
      issuer,
      subject: 'user@example.com',
      userId,
      createdAt: 'now',
    }),
  ).toThrow();
  expect(() =>
    authIdentitySchema.parse({
      provider: 'COGNITO',
      issuer,
      subject: userId,
      userId,
      createdAt: 'now',
    }),
  ).toThrow();
});
