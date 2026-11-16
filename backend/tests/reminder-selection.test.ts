import { expect, test } from 'vitest';
import type { Reminder } from '../src/domain/model/contracts.js';
import { localDateTime } from '../src/application/agent/clock-zone.js';
import {
  buildReminderPayload,
  classifyReminderSchedule,
  fallbackMessage,
  nextOverdueState,
  nextUpcomingState,
  parseScheduledDate,
  selectDueReminders,
  type ReminderTickConfig,
} from '../src/application/use-cases/reminder-selection.js';

const config: ReminderTickConfig = {
  timezone: 'America/Sao_Paulo',
  upcomingWindowMinutes: 60,
  overdueNagIntervalMinutes: 30,
  slotWindowMinutes: 20,
  morningSlot: '08:00',
  afternoonSlot: '13:00',
  maxRemindersPerPush: 8,
};

function reminder(overrides: Partial<Reminder>): Reminder {
  return {
    userId: 'u',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    id: 'r1',
    title: 'Consulta',
    status: 'active',
    ...overrides,
  };
}

test('classifyReminderSchedule and parseScheduledDate distinguish timed vs date-only', () => {
  expect(classifyReminderSchedule(reminder({ scheduledAt: '2026-01-02' })).kind).toBe('date-only');
  expect(classifyReminderSchedule(reminder({ scheduledDate: '2026-01-02' })).kind).toBe(
    'date-only',
  );
  expect(classifyReminderSchedule(reminder({})).kind).toBe('unscheduled');
  expect(parseScheduledDate('2026-01-02', config.timezone)).toBeNull();
  expect(parseScheduledDate('2026-01-02T19:00:00-03:00', config.timezone)?.toISOString()).toBe(
    '2026-01-02T22:00:00.000Z',
  );
  expect(parseScheduledDate('2026-01-02T19:00:00', config.timezone)?.toISOString()).toBe(
    '2026-01-02T22:00:00.000Z',
  );
});

test('selectDueReminders picks upcoming within window and overdue past cooldown', () => {
  const now = new Date('2026-01-02T21:30:00Z');
  const local = localDateTime(now, config.timezone);
  const upcoming = reminder({ id: 'up', scheduledAt: '2026-01-02T19:00:00-03:00' }); // 22:00Z (+30m)
  const overdue = reminder({ id: 'over', scheduledAt: '2026-01-02T17:00:00-03:00' }); // 20:00Z (-90m)
  const alreadySent = reminder({
    id: 'sent',
    scheduledAt: '2026-01-02T19:30:00-03:00',
    notificationState: { upcoming60For: '2026-01-02T19:30:00-03:00', upcoming60SentAt: 'x' },
  });
  const selection = selectDueReminders([upcoming, overdue, alreadySent], local, now, config);
  expect(selection.upcoming.map((x) => x.reminder.id)).toEqual(['up']);
  expect(selection.overdue.map((x) => x.reminder.id)).toEqual(['over']);
  expect(selection.overdue[0]?.overdueMinutes).toBe(90);
});

test('selectDueReminders emits unscheduled nudge only inside a slot window', () => {
  const now = new Date('2026-01-02T11:10:00Z'); // 08:10 local => morning slot
  const local = localDateTime(now, config.timezone);
  const chore = reminder({ id: 'chore' });
  const selection = selectDueReminders([chore], local, now, config);
  expect(selection.unscheduled.map((x) => x.reminder.id)).toEqual(['chore']);
  expect(selection.unscheduled[0]?.slotKey).toBe('2026-01-02#08:00');
});

test('buildReminderPayload maps overdue cobrança to SCOLDING/HIGH (valid avatar state)', () => {
  const overdue = buildReminderPayload('x', {
    upcoming: [],
    overdue: [{ reminder: reminder({}), scheduledAt: 's', overdueMinutes: 40, nagCount: 0 }],
    unscheduled: [],
  });
  expect(overdue.avatarState).toBe('SCOLDING');
  expect(overdue.priority).toBe('HIGH');

  const soon = buildReminderPayload('x', {
    upcoming: [{ reminder: reminder({}), scheduledAt: 's', minutesUntil: 10, overdueMinutes: 0 }],
    overdue: [],
    unscheduled: [],
  });
  expect(soon.avatarState).toBe('SCOLDING');

  const later = buildReminderPayload('x', {
    upcoming: [{ reminder: reminder({}), scheduledAt: 's', minutesUntil: 45, overdueMinutes: 0 }],
    overdue: [],
    unscheduled: [],
  });
  expect(later.avatarState).toBe('FOCUSED');
  expect(later.priority).toBe('NORMAL');
});

test('fallbackMessage escalates overdue nagging and keeps the reminder title', () => {
  const single = {
    upcoming: [],
    overdue: [{ reminder: reminder({ title: 'Pagar conta' }), scheduledAt: 's', overdueMinutes: 12, nagCount: 2 }],
    unscheduled: [],
  };
  const message = fallbackMessage(single);
  expect(message).toContain('Pagar conta');
});

test('notification state transitions accumulate overdue nag count', () => {
  const first = nextOverdueState(reminder({}), 's', new Date('2026-01-02T21:00:00Z'));
  expect(first.overdueNagCount).toBe(1);
  const second = nextOverdueState(
    reminder({ notificationState: { overdueFor: 's', overdueNagCount: 1 } }),
    's',
    new Date('2026-01-02T21:30:00Z'),
  );
  expect(second.overdueNagCount).toBe(2);
  expect(nextUpcomingState(reminder({ scheduledAt: 's' }), new Date()).upcoming60For).toBe('s');
});
