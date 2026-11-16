import { z } from 'zod';
import type { TaskRepository } from '../ports/task.js';
import type { Clock, IdGenerator } from '../ports/runtime.js';
import type { Task } from '../../domain/model/contracts.js';
import { AppError } from '../../domain/errors/app-error.js';
export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    relatedPersonId: z
      .string()
      .regex(/^[\w-]+$/)
      .optional(),
  })
  .strict();
export class Tasks {
  constructor(
    private repo: TaskRepository,
    private clock: Clock,
    private ids: IdGenerator,
  ) {}
  async create(userId: string, input: unknown) {
    const v = createTaskSchema.parse(input);
    const duplicate = (await this.repo.list(userId, 100)).find(
      (task) =>
        task.status === 'pending' && task.title.trim().toLowerCase() === v.title.toLowerCase(),
    );
    if (duplicate) return duplicate;
    const now = this.clock.now().toISOString();
    const task: Task = {
      id: this.ids.next(),
      userId,
      title: v.title,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      ...(v.relatedPersonId ? { relatedPersonId: v.relatedPersonId } : {}),
    };
    await this.repo.create(task);
    return task;
  }
  async get(userId: string, id: string) {
    const task = await this.repo.get(userId, id);
    if (!task) throw new AppError('task_not_found', 404);
    return task;
  }
  list(userId: string, limit?: number) {
    return this.repo.list(userId, limit);
  }
  async change(userId: string, id: string, status: 'completed' | 'cancelled') {
    const task = await this.get(userId, id);
    if (task.status === status) return task;
    if (task.status !== 'pending') throw new AppError('task_already_closed', 409);
    const next = { ...task, status, updatedAt: this.clock.now().toISOString() };
    if (!(await this.repo.update(next, 'pending'))) throw new AppError('task_conflict', 409);
    return next;
  }
}
