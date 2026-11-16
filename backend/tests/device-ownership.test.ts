import { expect, test } from 'vitest';
import { InMemoryDeviceRepository } from '../src/adapters/outbound/memory/device-repository.js';
import { Devices } from '../src/application/use-cases/devices.js';
import { SendNotification } from '../src/application/use-cases/send-notification.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';

const clock = { now: () => new Date('2026-09-23T00:00:00.000Z') };

test('registering a device moves ownership and stops the previous user from reading it', async () => {
  const repo = new InMemoryDeviceRepository();
  const devices = new Devices(repo, clock);
  const userA = createInternalUserId();
  const userB = createInternalUserId();
  await devices.put(userA, 'phone', { platform: 'android', pushToken: 'token-a' });
  expect((await repo.getOwnership('phone'))?.ownerUserId).toBe(userA);
  await devices.put(userB, 'phone', { platform: 'android', pushToken: 'token-b' });
  expect((await repo.getOwnership('phone'))?.ownerUserId).toBe(userB);
  expect(await repo.get(userA, 'phone')).toBeNull();
  await expect(devices.get(userA, 'phone')).rejects.toMatchObject({ status: 404 });
  await expect(devices.delete(userA, 'phone')).rejects.toMatchObject({ status: 404 });
  await devices.delete(userB, 'phone');
  expect(await repo.getOwnership('phone')).toBeNull();
});

test('FCM send requires current ownership and disables invalid tokens', async () => {
  const repo = new InMemoryDeviceRepository();
  const userA = createInternalUserId();
  const userB = createInternalUserId();
  const devices = new Devices(repo, clock);
  await devices.put(userA, 'phone', { platform: 'android', pushToken: 'stale' });
  await devices.put(userB, 'phone', { platform: 'android', pushToken: 'fresh' });
  const notifications = new SendNotification(
    repo,
    { send: async () => ({ status: 'invalid_token' }) },
    clock,
  );
  await expect(
    notifications.execute(userA, 'phone', {
      message: 'x',
      avatarState: 'NEUTRAL',
      priority: 'NORMAL',
      actions: [],
      assistantId: 'RIN',
    }),
  ).rejects.toMatchObject({ status: 404 });
  await notifications.execute(userB, 'phone', {
    message: 'x',
    avatarState: 'NEUTRAL',
    priority: 'NORMAL',
    actions: [],
    assistantId: 'YUI',
  });
  expect((await repo.get(userB, 'phone'))?.enabled).toBe(false);
});
