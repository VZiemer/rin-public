import { expect, test } from 'vitest';
import type { Reminder } from '../src/domain/model/contracts.js';
import { Reminders } from '../src/application/use-cases/reminders.js';
test('reminder dates normalize offsets and transitions preserve active reminders without TTL', async () => {
  let record: Reminder | null = null;
  const reminders = new Reminders(
    {
      get: async () => record,
      list: async () => (record ? [record] : []),
      create: async (v) => {
        record = v;
      },
      update: async (v) => {
        record = v;
        return true;
      },
      updateNotificationState: async () => {},
    },
    { now: () => new Date('2026-01-01') },
    { next: () => 'r' },
  );
  await expect(
    reminders.create('u', { title: 'x', scheduledAt: '2025-01-01T00:00:00Z' }),
  ).rejects.toThrow('future');
  const v = await reminders.create('u', { title: 'cat', scheduledAt: '2026-01-02T19:00:00-03:00' });
  expect(v.scheduledAt).toBe('2026-01-02T22:00:00.000Z');
  expect(v).not.toHaveProperty('expiresAt');
  expect((await reminders.change('u', 'r', 'snooze', '2026-01-03T00:00:00Z')).status).toBe(
    'active',
  );
  expect((await reminders.change('u', 'r', 'completed')).status).toBe('completed');
  await expect(reminders.change('u', 'r', 'snooze', '2026-01-04T00:00:00Z')).rejects.toThrow(
    'closed',
  );
});
test('creates unscheduled and date-only reminders without inventing a time', async () => {
  const items: Reminder[] = [];
  const reminders = new Reminders(
    {
      get: async () => items[0] ?? null,
      list: async () => items,
      create: async (v) => {
        items.push(v);
      },
      update: async () => true,
      updateNotificationState: async () => {},
    },
    { now: () => new Date('2026-01-01') },
    { next: () => 'r' },
  );
  const unscheduled = await reminders.create('u', { title: 'comprar racao' });
  expect(unscheduled.scheduledAt).toBeUndefined();
  expect(unscheduled.scheduledDate).toBeUndefined();
  const dated = await reminders.create('u', { title: 'ligar', scheduledDate: '2026-01-03' });
  expect(dated.scheduledDate).toBe('2026-01-03');
  expect(dated.scheduledAt).toBeUndefined();
});
