import { expect, test, vi } from 'vitest';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { event } from './http-fixture.js';
test('message validation, generated conversation and auth boundary', async () => {
  const execute = vi.fn(async () => ({
    message: 'ok',
    avatarState: 'NEUTRAL' as const,
    priority: 'NORMAL' as const,
    actions: [],
  }));
  const deps = {
    environment: 'dev' as const,
    devUserId: 'u',
    allowDevUserFallback: true,
    ids: { next: () => 'c' },
    agent: { execute },
  };
  const handler = createHandler(deps);
  expect((await handler(event('POST', '/agent/message', { message: 'oi' }))).statusCode).toBe(200);
  expect(execute).toHaveBeenCalledWith('u', 'oi', 'c', { deviceId: undefined, assistantId: 'RIN', turnId: 'test' });
  expect((await handler(event('POST', '/agent/message', { message: '' }))).statusCode).toBe(400);
  expect(
    (
      await createHandler({ ...deps, environment: 'production' })(
        event('POST', '/agent/message', { message: 'oi' }),
      )
    ).statusCode,
  ).toBe(401);
});
