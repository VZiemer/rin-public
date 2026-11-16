import { expect, test } from 'vitest';
import { principalFromVerifiedClaims } from '../src/domain/model/principal.js';

const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool';

test('converts verified JWT claims into an application principal', () => {
  const principal = principalFromVerifiedClaims(
    { sub: 'cognito-sub', iss: issuer, client_id: 'android', email: 'user@example.com' },
    { issuer, audience: 'android' },
  );
  expect(principal).toMatchObject({
    provider: 'COGNITO',
    issuer,
    subject: 'cognito-sub',
  });
  expect(principal.claims.email).toBe('user@example.com');
});

test('never builds a principal from request JSON fields and rejects bad issuer or audience', () => {
  expect(() =>
    principalFromVerifiedClaims(undefined, { issuer }),
  ).toThrow('unauthorized');
  expect(() =>
    principalFromVerifiedClaims({ sub: 'x', iss: 'https://evil.example' }, { issuer }),
  ).toThrow('unauthorized');
  expect(() =>
    principalFromVerifiedClaims({ sub: 'x', iss: issuer, client_id: 'other' }, { issuer, audience: 'android' }),
  ).toThrow('unauthorized');
});
