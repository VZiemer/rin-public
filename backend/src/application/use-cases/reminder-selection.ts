import type { AgentOutput, Reminder, RinPriority, RinState } from '../../domain/model/contracts.js';
import { hhmmToMinutes, zonedLocalDateToUtc, type LocalClock } from '../agent/clock-zone.js';

export interface ReminderTickConfig {
  timezone: string;
  upcomingWindowMinutes: number;
  overdueNagIntervalMinutes: number;
  slotWindowMinutes: number;
  morningSlot: string;
  afternoonSlot: string;
  maxRemindersPerPush: number;
}

export interface ReminderNotificationState {
  upcoming60For?: string;
  upcoming60SentAt?: string;
  overdueFor?: string;
  firstOverdueNagSentAt?: string;
  lastOverdueNagSentAt?: string;
  overdueNagCount?: number;
  allDaySlots?: Record<string, string>;
  lastAllDaySlot?: string;
  lastAllDaySentAt?: string;
}

export interface UpcomingItem {
  reminder: Reminder;
  scheduledAt: string;
  minutesUntil: number;
  overdueMinutes: number;
}
export interface OverdueItem {
  reminder: Reminder;
  scheduledAt: string;
  overdueMinutes: number;
  nagCount: number;
  minutesSinceLastNag?: number | null;
}
export interface UnscheduledItem {
  reminder: Reminder;
  slotKey: string;
  slot: string;
  reminderDate: string | null;
}
export interface ReminderBatch {
  upcoming: UpcomingItem[];
  overdue: OverdueItem[];
  unscheduled: UnscheduledItem[];
}
export interface ReminderSelection extends ReminderBatch {
  slot: string | null;
  reasons: string[];
}

type Schedule =
  | { kind: 'timed'; value: string }
  | { kind: 'date-only'; date: string }
  | { kind: 'unscheduled'; date: null };

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function notificationState(reminder: Reminder): ReminderNotificationState {
  return (reminder.notificationState ?? {}) as ReminderNotificationState;
}
function reminderId(reminder: Reminder): string {
  return reminder.id;
}

export function classifyReminderSchedule(reminder: Reminder): Schedule {
  const scheduledAt = cleanString(reminder.scheduledAt);
  if (scheduledAt) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(scheduledAt)) return { kind: 'date-only', date: scheduledAt };
    return { kind: 'timed', value: scheduledAt };
  }
  const date = cleanString(reminder.scheduledDate);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? { kind: 'date-only', date }
    : { kind: 'unscheduled', date: null };
}

export function parseScheduledDate(value: string, timezone: string): Date | null {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const localMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (localMatch) {
    return zonedLocalDateToUtc(
      {
        year: Number(localMatch[1]),
        month: Number(localMatch[2]),
        day: Number(localMatch[3]),
        hour: Number(localMatch[4]),
        minute: Number(localMatch[5]),
        second: Number(localMatch[6] ?? 0),
      },
      timezone,
    );
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function currentUnscheduledSlot(localTime: string, config: ReminderTickConfig): string | null {
  const current = hhmmToMinutes(localTime);
  for (const slot of [config.morningSlot, config.afternoonSlot]) {
    const start = hhmmToMinutes(slot);
    if (current >= start && current < start + config.slotWindowMinutes) return slot;
  }
  return null;
}

export function selectDueReminders(
  reminders: Reminder[],
  local: LocalClock,
  now: Date,
  config: ReminderTickConfig,
): ReminderSelection {
  const upcoming: UpcomingItem[] = [];
  const overdue: OverdueItem[] = [];
  const unscheduled: UnscheduledItem[] = [];
  const reasons: string[] = [];
  const slot = currentUnscheduledSlot(local.time, config);

  for (const reminder of reminders) {
    const schedule = classifyReminderSchedule(reminder);
    if (schedule.kind === 'timed') {
      const scheduledDate = parseScheduledDate(schedule.value, config.timezone);
      if (!scheduledDate) continue;
      const diffMinutes = (scheduledDate.getTime() - now.getTime()) / 60000;
      const state = notificationState(reminder);
      if (diffMinutes >= 0) {
        const alreadySent =
          state.upcoming60For === String(schedule.value) && Boolean(state.upcoming60SentAt);
        if (!alreadySent && diffMinutes <= config.upcomingWindowMinutes) {
          upcoming.push({
            reminder,
            scheduledAt: schedule.value,
            minutesUntil: Math.max(0, Math.ceil(diffMinutes)),
            overdueMinutes: 0,
          });
        }
        continue;
      }
      const overdueStateMatches = state.overdueFor === String(schedule.value);
      const lastNagAt =
        overdueStateMatches && state.lastOverdueNagSentAt
          ? new Date(state.lastOverdueNagSentAt)
          : null;
      const minutesSinceLastNag =
        lastNagAt && !Number.isNaN(lastNagAt.getTime())
          ? (now.getTime() - lastNagAt.getTime()) / 60000
          : null;
      if (minutesSinceLastNag === null || minutesSinceLastNag >= config.overdueNagIntervalMinutes) {
        overdue.push({
          reminder,
          scheduledAt: schedule.value,
          overdueMinutes: Math.max(1, Math.floor(Math.abs(diffMinutes))),
          nagCount: overdueStateMatches ? Number(state.overdueNagCount ?? 0) : 0,
          minutesSinceLastNag,
        });
      }
      continue;
    }
    if (schedule.kind === 'date-only' && schedule.date !== local.date) continue;
    if (!slot) continue;
    const slotKey = `${local.date}#${slot}`;
    const sentSlots = notificationState(reminder).allDaySlots ?? {};
    if (sentSlots[slotKey]) continue;
    unscheduled.push({
      reminder,
      slotKey,
      slot,
      reminderDate: schedule.kind === 'date-only' ? schedule.date : null,
    });
  }

  upcoming.sort((a, b) => a.minutesUntil - b.minutesUntil);
  overdue.sort((a, b) => b.overdueMinutes - a.overdueMinutes);
  if (upcoming.length) reasons.push('upcoming_within_60_minutes');
  if (overdue.length) reasons.push('overdue_active_reminders');
  if (unscheduled.length) reasons.push(`unscheduled_${slot ?? 'none'}`);
  return { upcoming, overdue, unscheduled, slot, reasons };
}

export function forceSelect(
  reminders: Reminder[],
  local: LocalClock,
  now: Date,
  config: ReminderTickConfig,
): ReminderSelection {
  const upcoming: UpcomingItem[] = [];
  const overdue: OverdueItem[] = [];
  const unscheduled: UnscheduledItem[] = [];
  for (const reminder of reminders.slice(0, config.maxRemindersPerPush)) {
    const schedule = classifyReminderSchedule(reminder);
    if (schedule.kind === 'timed') {
      const date = parseScheduledDate(schedule.value, config.timezone);
      const diffMinutes = date ? (date.getTime() - now.getTime()) / 60000 : 60;
      if (diffMinutes < 0) {
        overdue.push({
          reminder,
          scheduledAt: schedule.value,
          overdueMinutes: Math.max(1, Math.floor(Math.abs(diffMinutes))),
          nagCount: Number(notificationState(reminder).overdueNagCount ?? 0),
        });
      } else {
        upcoming.push({
          reminder,
          scheduledAt: schedule.value,
          minutesUntil: Math.max(0, Math.ceil(diffMinutes)),
          overdueMinutes: 0,
        });
      }
    } else {
      unscheduled.push({
        reminder,
        slotKey: `${local.date}#FORCED`,
        slot: 'FORCED',
        reminderDate: schedule.kind === 'date-only' ? schedule.date : null,
      });
    }
  }
  return { upcoming, overdue, unscheduled, slot: 'FORCED', reasons: ['forced'] };
}

/** Fill the push up to `maxRemindersPerPush`, prioritising upcoming then overdue. */
export function sliceBatch(selected: ReminderSelection, max: number): ReminderBatch {
  const upcoming = selected.upcoming.slice(0, max);
  const remainingAfterUpcoming = Math.max(0, max - upcoming.length);
  const overdue = selected.overdue.slice(0, remainingAfterUpcoming);
  const remainingAfterOverdue = Math.max(0, remainingAfterUpcoming - overdue.length);
  return { upcoming, overdue, unscheduled: selected.unscheduled.slice(0, remainingAfterOverdue) };
}

export function isEmptyBatch(batch: ReminderBatch): boolean {
  return batch.upcoming.length === 0 && batch.overdue.length === 0 && batch.unscheduled.length === 0;
}

export function summarizeBatch(batch: ReminderBatch) {
  return {
    upcoming: batch.upcoming.map((x) => ({
      id: reminderId(x.reminder),
      title: x.reminder.title,
      scheduledAt: x.scheduledAt,
      minutesUntil: x.minutesUntil,
    })),
    overdue: batch.overdue.map((x) => ({
      id: reminderId(x.reminder),
      title: x.reminder.title,
      scheduledAt: x.scheduledAt,
      overdueMinutes: x.overdueMinutes,
      nagCount: Number(x.nagCount ?? 0) + 1,
    })),
    unscheduled: batch.unscheduled.map((x) => ({
      id: reminderId(x.reminder),
      title: x.reminder.title,
      slot: x.slot,
      date: x.reminderDate,
    })),
  };
}

export function reminderContextItems(batch: ReminderBatch) {
  return {
    upcoming: batch.upcoming.map((item) => ({
      id: reminderId(item.reminder),
      title: item.reminder.title,
      scheduledAt: item.scheduledAt,
      minutesUntil: item.minutesUntil,
      overdueMinutes: 0,
    })),
    overdue: batch.overdue.map((item) => ({
      id: reminderId(item.reminder),
      title: item.reminder.title,
      scheduledAt: item.scheduledAt,
      overdueMinutes: item.overdueMinutes,
      previousNagCount: item.nagCount ?? 0,
    })),
    unscheduled: batch.unscheduled.map((item) => ({
      id: reminderId(item.reminder),
      title: item.reminder.title,
      date: item.reminderDate,
    })),
  };
}

export function fallbackMessage(batch: ReminderBatch): string {
  const { upcoming, overdue, unscheduled } = batch;
  if (overdue.length === 1 && upcoming.length === 0 && unscheduled.length === 0) {
    const item = overdue[0]!;
    const count = Number(item.nagCount ?? 0) + 1;
    if (count >= 5)
      return `Seriously? “${item.reminder.title}” is STILL pending. It has been ${item.overdueMinutes} minutes. Get it done or mark it as canceled, because I will not pretend this crap disappeared on its own.`;
    if (count >= 3)
      return `“${item.reminder.title}” is still pending. It is ${item.overdueMinutes} minutes overdue. Get it done and tell me when you finish — do not make me nag you again.`;
    if (count >= 2)
      return `I am still waiting for you to finish “${item.reminder.title}”. It is overdue. Come on, get it done and mark it as complete.`;
    return `“${item.reminder.title}” is overdue and still pending. Handle it now and tell me when you finish.`;
  }
  if (upcoming.length === 1 && overdue.length === 0 && unscheduled.length === 0) {
    const item = upcoming[0]!;
    if (item.minutesUntil <= 15)
      return `Hey. “${item.reminder.title}” is in ${item.minutesUntil || 'a few'} minutes. Do not say I did not warn you.`;
    return `Just so you remember: “${item.reminder.title}” is in about ${item.minutesUntil} minutes.`;
  }
  const titles = [...overdue, ...upcoming, ...unscheduled]
    .map((x) => x.reminder.title)
    .filter(Boolean)
    .slice(0, 5)
    .join(', ');
  if (overdue.length)
    return `There are still overdue items here: ${titles}. Get them done. I do not want to nag you again.`;
  if (upcoming.length)
    return `Some things are coming up: ${titles}. Take a look before you forget and blame the universe.`;
  return `Since apparently I have to keep this on your mind too: ${titles}. Try to handle it today.`;
}

/**
 * Build the notification payload. Overdue nagging maps to the valid SCOLDING
 * avatar state (the raw handler used 'ANGRY', which is not an Android avatar
 * state and would otherwise be coerced to NEUTRAL, losing the angry intent).
 */
export function buildReminderPayload(
  message: string,
  batch: ReminderBatch,
  mood: Record<string, unknown> = {},
): AgentOutput {
  const soonest = batch.upcoming.length
    ? Math.min(...batch.upcoming.map((x) => x.minutesUntil))
    : null;
  const maxOverdue = batch.overdue.length
    ? Math.max(...batch.overdue.map((x) => x.overdueMinutes))
    : null;
  let avatarState: RinState = 'NEUTRAL';
  let priority: RinPriority = 'NORMAL';
  if (maxOverdue !== null) {
    avatarState = 'SCOLDING';
    priority = 'HIGH';
  } else if (soonest !== null) {
    avatarState = soonest <= 15 ? 'SCOLDING' : 'FOCUSED';
    priority = soonest <= 15 ? 'HIGH' : 'NORMAL';
  } else {
    const primary = String(mood.primary ?? '').toUpperCase();
    if (primary.includes('PLAYFUL') || primary.includes('GRUMPY') || primary.includes('SMUG'))
      avatarState = 'SMUG';
    else if (primary.includes('TIRED') || Number(mood.energy) < 30) avatarState = 'TIRED';
  }
  return {
    message: String(message).slice(0, 1800),
    avatarState,
    priority,
    actions: [],
    assistantId: 'RIN',
  };
}

/** Per-reminder explanation of why it was/was not selected (debug events only). */
export function buildReminderDiagnostics(
  reminders: Reminder[],
  local: LocalClock,
  now: Date,
  config: ReminderTickConfig,
): Record<string, unknown>[] {
  return reminders.map((reminder) => {
    const schedule = classifyReminderSchedule(reminder);
    const state = notificationState(reminder);
    const base = {
      id: reminderId(reminder),
      title: reminder.title,
      status: reminder.status,
      scheduledAt: reminder.scheduledAt ?? null,
      scheduledDate: reminder.scheduledDate ?? null,
      scheduleKind: schedule.kind,
      notificationState: reminder.notificationState ?? null,
    };
    if (schedule.kind === 'timed') {
      const parsed = parseScheduledDate(schedule.value, config.timezone);
      if (!parsed) return { ...base, selected: false, reason: 'invalid_scheduledAt' };
      const diffMinutes = (parsed.getTime() - now.getTime()) / 60000;
      const alreadySent =
        state.upcoming60For === String(schedule.value) && Boolean(state.upcoming60SentAt);
      if (diffMinutes >= 0) {
        let reason = 'selected_upcoming';
        if (alreadySent) reason = 'already_sent_for_this_scheduledAt';
        else if (diffMinutes > config.upcomingWindowMinutes) reason = 'more_than_window_away';
        return {
          ...base,
          parsedScheduledAtUtc: parsed.toISOString(),
          minutesUntil: Number(diffMinutes.toFixed(2)),
          selected: !alreadySent && diffMinutes <= config.upcomingWindowMinutes,
          reason,
        };
      }
      const overdueStateMatches = state.overdueFor === String(schedule.value);
      const lastNagAt =
        overdueStateMatches && state.lastOverdueNagSentAt
          ? new Date(state.lastOverdueNagSentAt)
          : null;
      const minutesSinceLastNag =
        lastNagAt && !Number.isNaN(lastNagAt.getTime())
          ? (now.getTime() - lastNagAt.getTime()) / 60000
          : null;
      const selected =
        minutesSinceLastNag === null || minutesSinceLastNag >= config.overdueNagIntervalMinutes;
      return {
        ...base,
        parsedScheduledAtUtc: parsed.toISOString(),
        overdueMinutes: Number(Math.abs(diffMinutes).toFixed(2)),
        overdueNagCount: overdueStateMatches ? Number(state.overdueNagCount ?? 0) : 0,
        minutesSinceLastNag:
          minutesSinceLastNag === null ? null : Number(minutesSinceLastNag.toFixed(2)),
        selected,
        reason: selected ? 'selected_overdue' : 'overdue_nag_cooldown',
      };
    }
    const slot = currentUnscheduledSlot(local.time, config);
    if (schedule.kind === 'date-only' && schedule.date !== local.date)
      return { ...base, selected: false, reason: 'different_local_date', localDate: local.date };
    if (!slot)
      return { ...base, selected: false, reason: 'outside_unscheduled_slot', localTime: local.time };
    const slotKey = `${local.date}#${slot}`;
    if ((state.allDaySlots ?? {})[slotKey])
      return { ...base, selected: false, reason: 'unscheduled_slot_already_sent', slotKey };
    return { ...base, selected: true, reason: 'selected_unscheduled', slotKey };
  });
}

export function nextUpcomingState(reminder: Reminder, now: Date): Record<string, unknown> {
  return {
    ...notificationState(reminder),
    upcoming60For: reminder.scheduledAt,
    upcoming60SentAt: now.toISOString(),
  };
}
export function nextOverdueState(
  reminder: Reminder,
  scheduledAt: string,
  now: Date,
): Record<string, unknown> {
  const previous = notificationState(reminder);
  const sameSchedule = previous.overdueFor === String(scheduledAt);
  return {
    ...previous,
    overdueFor: String(scheduledAt),
    firstOverdueNagSentAt:
      sameSchedule && previous.firstOverdueNagSentAt
        ? previous.firstOverdueNagSentAt
        : now.toISOString(),
    lastOverdueNagSentAt: now.toISOString(),
    overdueNagCount: sameSchedule ? Number(previous.overdueNagCount ?? 0) + 1 : 1,
  };
}
export function nextUnscheduledState(
  reminder: Reminder,
  slotKey: string,
  slot: string,
  now: Date,
): Record<string, unknown> {
  const previous = notificationState(reminder);
  return {
    ...previous,
    allDaySlots: { ...(previous.allDaySlots ?? {}), [slotKey]: now.toISOString() },
    lastAllDaySlot: slot,
    lastAllDaySentAt: now.toISOString(),
  };
}
