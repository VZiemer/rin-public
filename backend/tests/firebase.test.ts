import { expect, test, vi } from 'vitest';
import { FirebaseNotificationGateway } from '../src/adapters/outbound/notifications/firebase.js';
test('Firebase encodes Rin payload and sanitizes transport errors', async () => {
  const send = vi.fn().mockResolvedValue('message-id');
  const gateway = new FirebaseNotificationGateway({ send });
  const payload = {
    message: 'oi',
    avatarState: 'NEUTRAL' as const,
    priority: 'HIGH' as const,
    actions: [],
  };
  expect(await gateway.send('token', payload)).toEqual({ status: 'sent', messageId: 'message-id' });
  expect(send.mock.calls[0]?.[0]).toMatchObject({
    data: {
      type: 'ASSISTANT_MESSAGE',
      assistantId: 'RIN',
      message: 'oi',
      avatarState: 'NEUTRAL',
      priority: 'HIGH',
      actions: '[]',
    },
    android: { priority: 'high' },
  });
  expect(send.mock.calls[0]?.[0].data.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(send.mock.calls[0]?.[0]).not.toHaveProperty('notification');
  await gateway.send('token', payload, { id: 'morning-RIN-user-2026-10-15', ttlSeconds: 21600 });
  expect(send.mock.calls[1]?.[0]).toMatchObject({
    data: { id: 'morning-RIN-user-2026-10-15' },
    android: { priority: 'high', ttl: 21600000 },
  });
  await expect(gateway.send('token', payload, { ttlSeconds: -1 })).rejects.toThrow(
    'invalid_notification_ttl',
  );
  send.mockRejectedValueOnce({
    code: 'messaging/registration-token-not-registered',
    message: 'secret',
  });
  expect(await gateway.send('token', payload)).toEqual({ status: 'invalid_token' });
  await expect(gateway.send('token', { ...payload, message: 'a'.repeat(4000) })).rejects.toThrow(
    'too_large',
  );
});
