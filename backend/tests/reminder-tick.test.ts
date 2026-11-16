import { expect, test, vi } from 'vitest';
import type { Device, Reminder } from '../src/domain/model/contracts.js';
import { ReminderTick, type ReminderTickDeps } from '../src/application/use-cases/reminder-tick.js';
import type { ReminderTickConfig } from '../src/application/use-cases/reminder-selection.js';

const config: ReminderTickConfig = {
  timezone: 'America/Sao_Paulo',
  upcomingWindowMinutes: 60,
  overdueNagIntervalMinutes: 30,
  slotWindowMinutes: 20,
  morningSlot: '08:00',
  afternoonSlot: '13:00',
  maxRemindersPerPush: 8,
};
const now = new Date('2026-01-02T21:30:00Z');
const device: Device = {
  userId: 'u',
  createdAt: 'now',
  updatedAt: 'now',
  id: 'd1',
  platform: 'android',
  pushToken: 'tok',
  enabled: true,
};
const singleton = { get: async () => null, put: async () => true };

function deps(reminders: Reminder[], overrides: Partial<ReminderTickDeps> = {}): ReminderTickDeps {
  return {
    reminders: {
      get: async () => null,
      list: async () => reminders,
      create: async () => {},
      update: async () => true,
      updateNotificationState: vi.fn(async () => {}),
    },
    devices: { get: async () => null, list: async () => [device], put: vi.fn(), delete: async () => {} },
    rinState: singleton,
    rinPreferences: singleton,
    rinWorldContext: singleton,
    persona: singleton,
    profile: singleton,
    relationship: singleton,
    rinEpisodes: { get: async () => null, list: async () => [], put: async () => true },
    text: { complete: vi.fn(async () => 'Não esquece da consulta.') },
    notifications: { send: vi.fn(async () => ({ status: 'simulated' as const })) },
    logs: { append: vi.fn(async () => {}) },
    clock: { now: () => now },
    config,
    userId: 'u',
    ...overrides,
  };
}

function upcomingReminder(): Reminder {
  return {
    userId: 'u',
    createdAt: 'now',
    updatedAt: 'now',
    id: 'up',
    title: 'Consulta',
    status: 'active',
    scheduledAt: '2026-01-02T19:00:00-03:00',
  };
}

test('reminder tick sends, marks notification state and writes a log', async () => {
  const d = deps([upcomingReminder()]);
  const result = await new ReminderTick(d).execute({});
  expect(result.decision).toBe('SENT');
  expect((result.payload as { message: string }).message).toBe('Não esquece da consulta.');
  expect(d.reminders.updateNotificationState).toHaveBeenCalledWith(
    'u',
    'up',
    expect.objectContaining({ upcoming60For: '2026-01-02T19:00:00-03:00' }),
    now,
  );
  expect(d.logs.append).toHaveBeenCalledWith('RIN_REMINDER_LOG', 'u', expect.any(Object), now);
});

test('reminder tick stays silent when nothing is due', async () => {
  const result = await new ReminderTick(deps([])).execute({});
  expect(result.decision).toBe('SILENT');
  expect(result.reason).toBe('nothing_due');
});

test('reminder tick dry run previews without delivering', async () => {
  const d = deps([upcomingReminder()]);
  const result = await new ReminderTick(d).execute({ dryRun: true });
  expect(result.decision).toBe('WOULD_SEND');
  expect(d.notifications.send).not.toHaveBeenCalled();
  expect(d.logs.append).not.toHaveBeenCalled();
});

test('reminder tick falls back to a canned message when the model fails', async () => {
  const d = deps([upcomingReminder()], {
    text: {
      complete: async () => {
        throw new Error('bedrock down');
      },
    },
  });
  const result = await new ReminderTick(d).execute({});
  expect(result.decision).toBe('SENT');
  expect((result.payload as { message: string }).message).toContain('Consulta');
});
