import { expect, test, vi } from 'vitest';
import { ConsoleNotificationGateway } from '../src/adapters/outbound/notifications/console.js';
import { SendNotification } from '../src/application/use-cases/send-notification.js';
test('notification flow hides payload and disables invalid device tokens', async () => {
  const log = vi.fn();
  const payload = {
    message: 'private',
    avatarState: 'NEUTRAL' as const,
    priority: 'NORMAL' as const,
    actions: [],
  };
  expect(await new ConsoleNotificationGateway(log).send('secret', payload)).toEqual({
    status: 'simulated',
  });
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|private/);
  const put = vi.fn();
  const repo = {
    get: async () => ({
      id: 'd',
      userId: 'u',
      pushToken: 'secret',
      platform: 'android' as const,
      enabled: true,
      createdAt: 'now',
      updatedAt: 'now',
    }),
    put,
    list: vi.fn(),
    delete: vi.fn(),
  };
  await new SendNotification(
    repo,
    { send: async () => ({ status: 'invalid_token' }) },
    { now: () => new Date('2026-01-01') },
  ).execute('u', 'd', payload);
  expect(put).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
});
