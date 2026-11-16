import { expect, test, vi } from 'vitest';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { authedEvent, event } from './http-fixture.js';

test('derives the current user from the authenticated context and rejects impersonation', async () => {
  const execute = vi.fn(async () => ({
    message: 'ok',
    avatarState: 'NEUTRAL' as const,
    priority: 'NORMAL' as const,
    actions: [],
  }));
  const handler = createHandler({
    environment: 'production',
    ids: { next: () => 'c' },
    agent: { execute },
    cognito: { issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool', audience: 'android' },
    resolveUser: { execute: async () => '11111111-1111-7111-8111-111111111111' },
  });
  const ok = await handler(
    authedEvent('POST', '/agent/message', { message: 'oi' }, {
      sub: 'cognito-sub',
      iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool',
      client_id: 'android',
    }),
  );
  expect(ok.statusCode).toBe(200);
  expect(execute).toHaveBeenCalledWith(
    '11111111-1111-7111-8111-111111111111',
    'oi',
    'c',
    expect.any(Object),
  );
  expect(
    (
      await handler(
        authedEvent('POST', '/agent/message', {
          message: 'oi',
          userId: '22222222-2222-7222-8222-222222222222',
        }),
      )
    ).statusCode,
  ).toBe(401);
  expect((await handler(event('POST', '/agent/message', { message: 'oi' }))).statusCode).toBe(401);
});
