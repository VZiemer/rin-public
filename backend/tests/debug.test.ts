import { expect, test, vi } from 'vitest';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { SendNotification } from '../src/application/use-cases/send-notification.js';
import { event } from './http-fixture.js';
test('debug push requires dev and explicit flag', async () => {
  const send = vi.fn(async () => ({ status: 'simulated' as const }));
  const devices = {
    get: async () => ({
      id: 'd',
      userId: 'u',
      pushToken: 't',
      platform: 'android' as const,
      enabled: true,
      createdAt: 'now',
      updatedAt: 'now',
    }),
    list: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  const deps = {
    environment: 'dev' as const,
    devUserId: 'u',
    allowDevUserFallback: true,
    ids: { next: () => 'id' },
    agent: { execute: vi.fn() },
    notifications: new SendNotification(devices, { send }, { now: () => new Date() }),
  };
  const request = event('POST', '/debug/notifications', {
    deviceId: 'd',
    payload: { message: 'test', avatarState: 'idle', priority: 'normal', actions: [] },
  });
  expect((await createHandler(deps)(request)).statusCode).toBe(404);
  expect(
    (
      await createHandler({ ...deps, environment: 'production', enableDebugEndpoints: true })(
        request,
      )
    ).statusCode,
  ).toBe(404);
  expect(send).not.toHaveBeenCalled();
  expect((await createHandler({ ...deps, enableDebugEndpoints: true })(request)).statusCode).toBe(
    200,
  );
  expect(send).toHaveBeenCalledTimes(1);
});
