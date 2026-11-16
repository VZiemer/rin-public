import { afterEach, expect, test, vi } from 'vitest';
import { handler } from '../src/bootstrap/scheduled-test-push.js';
afterEach(() => vi.unstubAllEnvs());
test('scheduled worker is inert when disabled or in production', async () => {
  vi.stubEnv('APP_ENV', 'dev');
  vi.stubEnv('TEST_PUSH_ENABLED', 'false');
  expect(await handler({})).toEqual({ status: 'skipped', reason: 'disabled' });
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('TEST_PUSH_ENABLED', 'true');
  expect(await handler({})).toEqual({ status: 'skipped', reason: 'disabled' });
});
test('scheduled worker rejects malformed events and target overrides', async () => {
  vi.stubEnv('APP_ENV', 'dev');
  vi.stubEnv('TEST_PUSH_ENABLED', 'true');
  await expect(handler({ scheduledAt: 'invalid' })).rejects.toThrow();
  await expect(handler({ scheduledAt: '2026-09-14T11:00:00Z', userId: 'other' })).rejects.toThrow();
});
