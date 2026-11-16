import { expect, test } from 'vitest';
import { InMemoryDeviceRepository } from '../src/adapters/outbound/memory/device-repository.js';
import { Devices } from '../src/application/use-cases/devices.js';
import { SendNotification } from '../src/application/use-cases/send-notification.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';

test('covers registration, token rotation, logout, switch and stale access', async () => {
  const repo = new InMemoryDeviceRepository();
  const devices = new Devices(repo, { now: () => new Date('2026-09-23T00:00:00.000Z') });
  const userA = createInternalUserId();
  const userB = createInternalUserId();
  await devices.put(userA, 'phone', { platform: 'android', pushToken: 't1' });
  await devices.put(userA, 'phone', { platform: 'android', pushToken: 't2' });
  expect((await repo.getOwnership('phone'))?.pushToken).toBe('t2');
  await devices.delete(userA, 'phone');
  expect(await repo.getOwnership('phone')).toBeNull();
  await devices.put(userA, 'phone', { platform: 'android', pushToken: 't3' });
  await devices.put(userB, 'phone', { platform: 'android', pushToken: 't3' });
  const notifications = new SendNotification(repo, { send: async () => ({ status: 'sent' }) }, { now: () => new Date() });
  await expect(
    notifications.execute(userA, 'phone', { message: 'x', avatarState: 'NEUTRAL', priority: 'NORMAL', actions: [] }),
  ).rejects.toMatchObject({ status: 404 });
  await devices.delete(userB, 'phone');
  await expect(
    notifications.execute(userB, 'phone', { message: 'x', avatarState: 'NEUTRAL', priority: 'NORMAL', actions: [] }),
  ).rejects.toMatchObject({ status: 404 });
});
