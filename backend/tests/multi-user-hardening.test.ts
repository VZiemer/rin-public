import { expect, test } from 'vitest';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { principalFromVerifiedClaims } from '../src/domain/model/principal.js';
import { isInternalUserId } from '../src/domain/model/user-id.js';
import { authedEvent, event } from './http-fixture.js';

const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool';

test('fails closed for missing JWT, bad issuer, bad audience and missing mapping', async () => {
  const handler = createHandler({
    environment: 'production',
    devUserId: 'dev-user',
    ids: { next: () => 'c' },
    agent: { execute: async () => ({ message: 'ok', avatarState: 'NEUTRAL', priority: 'NORMAL', actions: [] }) },
    cognito: { issuer, audience: 'android' },
    resolveUser: { execute: async () => null },
  });
  expect((await handler(event('POST', '/agent/message', { message: 'oi' }))).statusCode).toBe(401);
  expect(
    (
      await handler(
        authedEvent('POST', '/agent/message', { message: 'oi' }, { sub: 'x', iss: 'https://evil.example', client_id: 'android' }),
      )
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await handler(
        authedEvent('POST', '/agent/message', { message: 'oi' }, { sub: 'x', iss: issuer, client_id: 'other' }),
      )
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await handler(
        authedEvent('POST', '/agent/message', { message: 'oi' }, { sub: 'x', iss: issuer, client_id: 'android' }),
      )
    ).statusCode,
  ).toBe(401);
  expect(isInternalUserId('dev-user')).toBe(false);
  const devWithoutFallback = createHandler({
    environment: 'dev',
    devUserId: 'dev-user',
    ids: { next: () => 'c' },
    agent: { execute: async () => ({ message: 'ok', avatarState: 'NEUTRAL', priority: 'NORMAL', actions: [] }) },
  });
  expect((await devWithoutFallback(event('POST', '/agent/message', { message: 'oi' }))).statusCode).toBe(401);
  expect(
    principalFromVerifiedClaims(
      { sub: 'x', iss: issuer, client_id: 'android', email: 'a@b.c' },
      { issuer, audience: 'android' },
    ).subject,
  ).toBe('x');
});
