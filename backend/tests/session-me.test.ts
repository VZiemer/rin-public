import { expect, test } from 'vitest';
import { InMemoryAuthIdentityRepository } from '../src/adapters/outbound/memory/auth-identity-repository.js';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { BootstrapAuthenticatedUser } from '../src/application/use-cases/bootstrap-authenticated-user.js';
import { ResolveAuthenticatedUser } from '../src/application/use-cases/resolve-authenticated-user.js';
import type { UserProfile } from '../src/domain/model/contracts.js';
import { isInternalUserId } from '../src/domain/model/user-id.js';
import { authedEvent } from './http-fixture.js';

const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool';

function createSessionHandler() {
  const identities = new InMemoryAuthIdentityRepository();
  const profiles = new Map<string, UserProfile>();
  const profileRepo = {
    get: async (userId: string) => profiles.get(userId) ?? null,
    put: async (value: UserProfile) => {
      profiles.set(value.userId, value);
      return true;
    },
  };
  const handler = createHandler({
    environment: 'production',
    ids: { next: () => 'c' },
    agent: { execute: async () => ({ message: 'ok', avatarState: 'NEUTRAL', priority: 'NORMAL', actions: [] }) },
    cognito: { issuer, audience: 'android' },
    resolveUser: new ResolveAuthenticatedUser(identities),
    bootstrapUser: new BootstrapAuthenticatedUser(identities, profileRepo, {
      now: () => new Date('2026-09-23T00:00:00.000Z'),
    }),
    profiles: profileRepo,
  });
  return { handler };
}

test('session bootstrap is idempotent and GET /me returns safe profile metadata', async () => {
  const { handler } = createSessionHandler();
  const claims = { sub: 'cognito-sub', iss: issuer, client_id: 'android', email: 'a@example.com' };
  const first = await handler(authedEvent('POST', '/session/bootstrap', {}, claims));
  const second = await handler(authedEvent('POST', '/session/bootstrap', {}, claims));
  expect(first.statusCode).toBe(200);
  const body = JSON.parse(first.body) as { userId: string; defaultAssistantId: string; profileInitialized: boolean };
  expect(isInternalUserId(body.userId)).toBe(true);
  expect(body.userId).not.toBe('cognito-sub');
  expect(body.defaultAssistantId).toBe('RIN');
  expect(JSON.parse(second.body).userId).toBe(body.userId);
  const me = await handler(authedEvent('GET', '/me', undefined, claims));
  expect(me.statusCode).toBe(200);
  expect(me.body).not.toContain('refresh');
  expect(me.body).not.toContain('a@example.com');
  expect(JSON.parse(me.body).userId).toBe(body.userId);
});

test('bootstrap and /me reject missing JWT and client-supplied userId', async () => {
  const { handler } = createSessionHandler();
  expect((await handler({ rawPath: '/session/bootstrap', requestContext: { requestId: 't', http: { method: 'POST' } }, body: '{}' })).statusCode).toBe(401);
  expect(
    (
      await handler(
        authedEvent(
          'POST',
          '/session/bootstrap',
          { userId: '00000000-0000-7000-8000-000000000099' },
          { sub: 'cognito-sub', iss: issuer, client_id: 'android' },
        ),
      )
    ).statusCode,
  ).toBe(401);
});
