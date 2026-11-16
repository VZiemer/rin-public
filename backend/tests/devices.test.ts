import { expect, test, vi } from 'vitest';
import { Devices } from '../src/application/use-cases/devices.js';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { event } from './http-fixture.js';
test('device API never returns push tokens and deletion is idempotent', async () => {
  const repo = { get: vi.fn(async () => null), put: vi.fn(), list: vi.fn(), delete: vi.fn() };
  const handler = createHandler({
    environment: 'dev',
    devUserId: 'u',
    allowDevUserFallback: true,
    ids: { next: () => 'id' },
    agent: { execute: vi.fn() },
    devices: new Devices(repo, { now: () => new Date('2026-01-01') }),
  });
  const response = await handler(
    event('PUT', '/devices/phone', { platform: 'android', pushToken: 'secret-token' }),
  );
  expect(response.statusCode).toBe(200);
  expect(response.body).not.toContain('secret-token');
  expect(response.body).not.toContain('pushToken');
  expect((await handler(event('DELETE', '/devices/phone'))).statusCode).toBe(204);
  expect((await handler(event('GET', '/devices/phone'))).statusCode).toBe(404);
  expect(
    (await handler(event('PUT', '/devices/phone', { platform: 'ios', pushToken: 'x' }))).statusCode,
  ).toBe(400);
});
