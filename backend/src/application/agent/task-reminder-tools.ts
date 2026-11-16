import { z } from 'zod';
import { defineTool } from './tools.js';
import { createTaskSchema, type Tasks } from '../use-cases/tasks.js';
import { createReminderSchema, type Reminders } from '../use-cases/reminders.js';
import { addLocalDays, localDateOf, localDateTimeToIso, type LocalTimeContext } from './local-time.js';
export const reminderToolSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    // Tool input is intentionally permissive. Different Bedrock models may emit
    // natural clock strings such as "18h", "18", "18:00" or "6pm". They are
    // normalized below before reaching the strict reminder/domain schema.
    scheduledAt: z.string().trim().min(1).max(100).optional(),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    relativeDay: z.enum(['today', 'tomorrow']).optional(),
    time: z.string().trim().min(1).max(32).optional(),
    inMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
    relatedTaskId: z
      .string()
      .regex(/^[\w-]+$/)
      .optional(),
    relatedPersonId: z
      .string()
      .regex(/^[\w-]+$/)
      .optional(),
  })
  .strip();
export function normalizeReminderClock(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let v = value.trim().toLowerCase().replace(/\s+/g, '');
  v = v.replace(/horas?$/, 'h');
  let match = v.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59)
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  match = v.match(/^(\d{1,2})h(?:(\d{1,2}))?$/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59)
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  match = v.match(/^(\d{1,2})(?::(\d{1,2}))?(am|pm)$/);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      if (match[3] === 'am') hour = hour === 12 ? 0 : hour;
      else hour = hour === 12 ? 12 : hour + 12;
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  return null;
}
export function resolveClockOnlyReminder(
  clockValue: string,
  relativeDay: 'today' | 'tomorrow' | undefined,
  time?: LocalTimeContext,
) {
  if (!time) throw new Error('missing_time_context');
  const normalized = normalizeReminderClock(clockValue);
  if (!normalized) throw new Error('invalid_reminder_time');
  const days = relativeDay === 'tomorrow' ? 1 : 0;
  let date = addLocalDays(time.localDate, days);
  let scheduledAt = localDateTimeToIso(date, normalized, time.timezone);
  // A clock without an explicit day means the next occurrence of that time:
  // today if still in the future, otherwise tomorrow.
  if (!relativeDay && Date.parse(scheduledAt) <= Date.parse(time.currentTimestamp)) {
    date = addLocalDays(time.localDate, 1);
    scheduledAt = localDateTimeToIso(date, normalized, time.timezone);
  }
  return scheduledAt;
}
export function resolveReminderInput(
  input: z.infer<typeof reminderToolSchema>,
  time?: LocalTimeContext,
) {
  let scheduledAt: string | undefined;
  let scheduledDate: string | undefined;
  if (input.inMinutes) {
    if (!time) throw new Error('missing_time_context');
    scheduledAt = new Date(Date.parse(time.currentTimestamp) + input.inMinutes * 60_000).toISOString();
  } else if (input.scheduledAt) {
    const raw = input.scheduledAt.trim();
    const parsed = Date.parse(raw);
    // Full ISO/date-time values are kept; clock-only values such as "18h"
    // are resolved in the user's local timezone.
    if (Number.isFinite(parsed) && /\d{4}-\d{2}-\d{2}/.test(raw))
      scheduledAt = new Date(parsed).toISOString();
    else scheduledAt = resolveClockOnlyReminder(raw, input.relativeDay, time);
  } else if (input.time) {
    scheduledAt = resolveClockOnlyReminder(input.time, input.relativeDay, time);
  } else if (input.scheduledDate) {
    scheduledDate = input.scheduledDate;
  } else if (input.relativeDay) {
    if (!time) throw new Error('missing_time_context');
    scheduledDate = addLocalDays(time.localDate, input.relativeDay === 'tomorrow' ? 1 : 0);
  }
  return createReminderSchema.parse({
    title: input.title,
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(scheduledDate ? { scheduledDate } : {}),
    ...(input.relatedTaskId ? { relatedTaskId: input.relatedTaskId } : {}),
    ...(input.relatedPersonId ? { relatedPersonId: input.relatedPersonId } : {}),
  });
}
const taskWithOptionalReminderSchema = createTaskSchema.extend({
  reminder: reminderToolSchema.omit({ title: true, relatedTaskId: true }).optional(),
});
export function taskReminderTools(tasks: Tasks, reminders: Reminders) {
  const listSchema = z.object({ limit: z.number().int().min(1).max(100).optional() }).strict();
  const completionSchema = z
    .object({
      id: z
        .string()
        .regex(/^[\w-]+$/)
        .optional(),
      title: z.string().trim().min(1).max(500).optional(),
    })
    .strict()
    .refine((v) => Boolean(v.id || v.title));
  const normalizedTitle = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const resolveOpenItem = async <T extends { id: string; title: string; status: string }>(
    items: T[],
    input: { id?: string | undefined; title?: string | undefined },
    openStatus: string,
  ) => {
    const open = items.filter((item) => item.status === openStatus);
    if (input.id) {
      const exactId = open.find((item) => item.id === input.id);
      if (exactId) return exactId;
    }
    if (input.title) {
      const wanted = normalizedTitle(input.title);
      const exact = open.filter((item) => normalizedTitle(item.title) === wanted);
      if (exact.length === 1) return exact[0]!;
      const partial = open.filter((item) => {
        const title = normalizedTitle(item.title);
        return title.includes(wanted) || wanted.includes(title);
      });
      if (partial.length === 1) return partial[0]!;
    }
    throw new Error('completion_target_not_found_or_ambiguous');
  };
  return [
    defineTool({
      name: 'create_task',
      description: 'Create a pending task when the user explicitly asks to add/create one.',
      risk: 'WRITE',
      inputSchema: createTaskSchema,
      execute: (v, c) => tasks.create(c.userId, v),
    }),
    defineTool({
      name: 'create_task_with_optional_reminder',
      description:
        'Create a pending task and, when the user asked to be reminded, create a related reminder for the same task.',
      risk: 'WRITE',
      inputSchema: taskWithOptionalReminderSchema,
      execute: async (v, c) => {
        const task = await tasks.create(c.userId, {
          title: v.title,
          relatedPersonId: v.relatedPersonId,
        });
        if (!v.reminder) return { task, reminder: null };
        const reminder = await reminders.create(
          c.userId,
          resolveReminderInput(
            {
              ...v.reminder,
              title: v.title,
              relatedTaskId: task.id,
            },
            c.time,
          ),
        );
        return { task, reminder };
      },
    }),
    defineTool({
      name: 'list_tasks',
      description:
        'List only pending user tasks. Completed and cancelled tasks must not be shown as current tasks.',
      risk: 'READ',
      inputSchema: listSchema,
      execute: async (v, c) =>
        (await tasks.list(c.userId, v.limit ?? 100)).filter((task) => task.status === 'pending'),
    }),
    defineTool({
      name: 'complete_task',
      description:
        "Mark a specific pending task as completed. Use its id from context when possible; otherwise use the task title. For 'I did it', 'I finished' or 'it is done', call this only when the referenced task is unambiguous from the conversation/context.",
      risk: 'WRITE',
      inputSchema: completionSchema,
      execute: async (v, c) => {
        const allTasks = await tasks.list(c.userId, 100);
        let targets;
        if (v.id) {
          targets = [await resolveOpenItem(allTasks, v, 'pending')];
        } else {
          const wanted = normalizedTitle(v.title!);
          const open = allTasks.filter((item) => item.status === 'pending');
          const exact = open.filter((item) => normalizedTitle(item.title) === wanted);
          if (exact.length) targets = exact;
          else targets = [await resolveOpenItem(allTasks, v, 'pending')];
        }
        const completedTasks = [];
        const completedReminders = [];
        for (const task of targets) {
          completedTasks.push(await tasks.change(c.userId, task.id, 'completed'));
          const related = (await reminders.list(c.userId, 100)).filter(
            (reminder) => reminder.status === 'active' && reminder.relatedTaskId === task.id,
          );
          for (const reminder of related)
            completedReminders.push(await reminders.change(c.userId, reminder.id, 'completed'));
        }
        return { tasks: completedTasks, completedReminders };
      },
    }),
    defineTool({
      name: 'create_reminder',
      description:
        'Create a reminder. For a clock time, prefer the time field (examples: 18:00, 18h, 6pm). relativeDay is optional: when omitted, the next occurrence of that clock time is used (today if still future, otherwise tomorrow). Use scheduledAt for a full ISO date-time, inMinutes for offsets, and relativeDay/scheduledDate for day-only reminders. If the user gives no date/time at all, create an unscheduled reminder instead of inventing a time.',
      risk: 'WRITE',
      inputSchema: reminderToolSchema,
      execute: (v, c) => reminders.create(c.userId, resolveReminderInput(v, c.time)),
    }),
    defineTool({
      name: 'list_reminders',
      description:
        'List only active user reminders. Completed and cancelled reminders must not be shown as current reminders.',
      risk: 'READ',
      inputSchema: listSchema,
      execute: async (v, c) =>
        (await reminders.list(c.userId, v.limit ?? 100)).filter(
          (reminder) => reminder.status === 'active',
        ),
    }),
    defineTool({
      name: 'complete_reminder',
      description:
        "Mark a specific active reminder as completed. Use its id from context when possible; otherwise use the reminder title. For 'I did it', 'I finished' or 'it is done', call this only when the referenced reminder is unambiguous from the conversation/context.",
      risk: 'WRITE',
      inputSchema: completionSchema,
      execute: async (v, c) => {
        const allReminders = await reminders.list(c.userId, 100);
        let targets;
        if (v.id) {
          targets = [await resolveOpenItem(allReminders, v, 'active')];
        } else {
          const wanted = normalizedTitle(v.title!);
          const open = allReminders.filter((item) => item.status === 'active');
          const exact = open.filter((item) => normalizedTitle(item.title) === wanted);
          if (exact.length) targets = exact;
          else targets = [await resolveOpenItem(allReminders, v, 'active')];
        }
        const completedReminders = [];
        for (const reminder of targets)
          completedReminders.push(await reminders.change(c.userId, reminder.id, 'completed'));
        return { reminders: completedReminders };
      },
    }),
    defineTool({
      name: 'get_today_items',
      description: 'List pending tasks and active reminders scheduled for the user local date.',
      risk: 'READ',
      inputSchema: z.object({}).strict(),
      execute: async (_v, c) => {
        const time = c.time;
        if (!time) throw new Error('missing_time_context');
        const [allTasks, allReminders] = await Promise.all([
          tasks.list(c.userId, 100),
          reminders.list(c.userId, 100),
        ]);
        const todayReminders = allReminders
          .filter((reminder) => {
            if (reminder.status !== 'active') return false;
            if (reminder.scheduledAt)
              return localDateOf(reminder.scheduledAt, time.timezone) === time.localDate;
            if (reminder.scheduledDate) return reminder.scheduledDate === time.localDate;
            return true;
          })
          .sort((a, b) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999'));
        return {
          date: time.localDate,
          timezone: time.timezone,
          tasks: allTasks.filter((task) => task.status === 'pending'),
          reminders: todayReminders,
        };
      },
    }),
  ];
}
