import { expect, test } from 'vitest';
import { InMemoryDeviceRepository } from '../src/adapters/outbound/memory/device-repository.js';
import { Devices } from '../src/application/use-cases/devices.js';
import { SendNotification } from '../src/application/use-cases/send-notification.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';

test('three users cannot read or redirect each others owned records', async () => {
  const users = [createInternalUserId(), createInternalUserId(), createInternalUserId()];
  const memories = new Map<string, string>();
  const relationships = new Map<string, string>();
  const tasks = new Map<string, string[]>();
  const reminders = new Map<string, string[]>();
  const devices = new InMemoryDeviceRepository();
  const api = new Devices(devices, { now: () => new Date('2026-09-23T00:00:00.000Z') });
  for (const [index, userId] of users.entries()) {
    memories.set(userId, `fact-${index}`);
    relationships.set(`${userId}#RIN`, `rel-${index}`);
    tasks.set(userId, [`task-${index}`]);
    reminders.set(userId, [`reminder-${index}`]);
    await api.put(userId, `device-${index}`, { platform: 'android', pushToken: `tok-${index}` });
  }
  expect(memories.get(users[0]!)).not.toBe(memories.get(users[1]!));
  expect(relationships.get(`${users[0]!}#RIN`)).not.toBe(relationships.get(`${users[1]!}#RIN`));
  expect(tasks.get(users[0]!)).not.toEqual(tasks.get(users[1]!));
  expect(reminders.get(users[0]!)).not.toEqual(reminders.get(users[2]!));
  await expect(api.get(users[0]!, 'device-1')).rejects.toMatchObject({ status: 404 });
  const notifications = new SendNotification(
    devices,
    { send: async () => ({ status: 'sent' }) },
    { now: () => new Date() },
  );
  await expect(
    notifications.execute(users[0]!, 'device-1', {
      message: 'nope',
      avatarState: 'NEUTRAL',
      priority: 'NORMAL',
      actions: [],
    }),
  ).rejects.toMatchObject({ status: 404 });
  expect(await devices.getOwnership('device-1')).toMatchObject({ ownerUserId: users[1] });
});
