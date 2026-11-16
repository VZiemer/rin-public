import { z } from 'zod';
import type { ReminderRepository } from '../ports/reminder.js';
import type { Clock, IdGenerator } from '../ports/runtime.js';
import type { Reminder } from '../../domain/model/contracts.js';
import { AppError } from '../../domain/errors/app-error.js';
export const createReminderSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    scheduledAt: z.iso.datetime({ offset: true }).optional(),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    relatedTaskId: z
      .string()
      .regex(/^[\w-]+$/)
      .optional(),
    relatedPersonId: z
      .string()
      .regex(/^[\w-]+$/)
      .optional(),
  })
  .strict();
export class Reminders {
  constructor(
    private repo: ReminderRepository,
    private clock: Clock,
    private ids: IdGenerator,
  ) {}
  private date(value: string) {
    const date = z.iso.datetime({ offset: true }).parse(value);
    if (Date.parse(date) <= this.clock.now().getTime())
      throw new AppError('schedule_must_be_future');
    return new Date(date).toISOString();
  }
  async create(userId: string, input: unknown) {
    const v = createReminderSchema.parse(input);
    const scheduledAt = v.scheduledAt ? this.date(v.scheduledAt) : undefined;
    const duplicate = (await this.repo.list(userId, 100)).find((reminder) => {
      if (
        reminder.status !== 'active' ||
        reminder.title.trim().toLowerCase() !== v.title.toLowerCase()
      )
        return false;
      return (
        (reminder.scheduledAt ?? null) === (scheduledAt ?? null) &&
        (reminder.scheduledDate ?? null) === (v.scheduledDate ?? null)
      );
    });
    if (duplicate) return duplicate;
    const now = this.clock.now().toISOString();
    const reminder: Reminder = {
      ...v,
      id: this.ids.next(),
      userId,
      ...(scheduledAt ? { scheduledAt } : {}),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.create(reminder);
    return reminder;
  }
  async get(userId: string, id: string) {
    const v = await this.repo.get(userId, id);
    if (!v) throw new AppError('reminder_not_found', 404);
    return v;
  }
  list(userId: string, limit?: number) {
    return this.repo.list(userId, limit);
  }
  async change(
    userId: string,
    id: string,
    action: 'completed' | 'cancelled' | 'snooze',
    scheduledAt?: string,
  ) {
    const v = await this.get(userId, id);
    if (action === v.status) return v;
    if (v.status !== 'active') throw new AppError('reminder_already_closed', 409);
    const next: Reminder = {
      ...v,
      status: action === 'snooze' ? 'active' : action,
      scheduledAt: action === 'snooze' ? this.date(scheduledAt ?? '') : v.scheduledAt,
      updatedAt: new Date(
        Math.max(this.clock.now().getTime(), Date.parse(v.updatedAt) + 1),
      ).toISOString(),
    };
    if (!(await this.repo.update(next, v.updatedAt))) throw new AppError('reminder_conflict', 409);
    return next;
  }
}
