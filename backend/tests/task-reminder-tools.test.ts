import { expect, test, vi } from 'vitest';
import {
  taskReminderTools,
  normalizeReminderClock,
  resolveReminderInput,
} from '../src/application/agent/task-reminder-tools.js';
import { AgentToolRegistry, AgentToolExecutor } from '../src/application/agent/tools.js';
import { Tasks } from '../src/application/use-cases/tasks.js';
import { Reminders } from '../src/application/use-cases/reminders.js';
import type { Reminder, Task } from '../src/domain/model/contracts.js';
test('task/reminder tools use trusted execution identity and validate dates', async () => {
  const create = vi.fn();
  const repo = {
    get: vi.fn(),
    list: vi.fn(async () => []),
    create,
    update: vi.fn(),
    updateNotificationState: vi.fn(),
  };
  const clock = { now: () => new Date('2026-01-01') };
  const ids = { next: () => 'id' };
  const registry = new AgentToolRegistry(
    taskReminderTools(new Tasks(repo, clock, ids), new Reminders(repo, clock, ids)),
  );
  const executor = new AgentToolExecutor(registry);
  const context = { userId: 'trusted', conversationId: 'c' };
  await executor.execute({ id: '1', name: 'create_task', input: { title: 'task' } }, context);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'trusted', status: 'pending' }),
  );
  await expect(
    executor.execute(
      { id: '1', name: 'create_task', input: { title: 'task', userId: 'attacker' } },
      context,
    ),
  ).rejects.toThrow();
  expect(registry.definitions()).toHaveLength(8);
});
test('normalizes clock strings and resolves unscheduled or day-only reminders', () => {
  expect(normalizeReminderClock('18h')).toBe('18:00');
  expect(normalizeReminderClock('18:00')).toBe('18:00');
  expect(normalizeReminderClock('6pm')).toBe('18:00');
  expect(normalizeReminderClock('18 horas')).toBe('18:00');
  const time = {
    currentTimestamp: '2026-09-14T12:00:00.000Z',
    timezone: 'America/Sao_Paulo',
    localDate: '2026-09-14',
    localWeekday: 'Monday',
  };
  expect(resolveReminderInput({ title: 'x' }, time)).toEqual({ title: 'x' });
  expect(resolveReminderInput({ title: 'x', scheduledDate: '2026-09-15' }, time)).toEqual({
    title: 'x',
    scheduledDate: '2026-09-15',
  });
  expect(resolveReminderInput({ title: 'x', relativeDay: 'tomorrow' }, time)).toEqual({
    title: 'x',
    scheduledDate: '2026-09-15',
  });
  expect(resolveReminderInput({ title: 'x', time: '18h' }, time).scheduledAt).toMatch(
    /^2026-09-14T21:00:00/,
  );
});
test('complete_task and complete_reminder resolve exact titles and reject ambiguity', async () => {
  const now = '2026-09-14T12:00:00.000Z';
  const tasks: Task[] = [
    {
      id: 't1',
      userId: 'u',
      title: 'Revisar staging',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 't2',
      userId: 'u',
      title: 'Revisar producao',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    },
  ];
  const reminders: Reminder[] = [
    {
      id: 'r1',
      userId: 'u',
      title: 'Veterinario',
      status: 'active',
      relatedTaskId: 't1',
      scheduledAt: '2026-09-15T12:00:00.000Z',
      createdAt: now,
      updatedAt: now,
    },
  ];
  const taskRepo = {
    get: async (_u: string, id: string) => tasks.find((item) => item.id === id) ?? null,
    list: async () => tasks,
    create: vi.fn(),
    update: async (v: Task) => {
      const index = tasks.findIndex((item) => item.id === v.id);
      if (index < 0) return false;
      tasks[index] = v;
      return true;
    },
  };
  const reminderRepo = {
    get: async (_u: string, id: string) => reminders.find((item) => item.id === id) ?? null,
    list: async () => reminders,
    create: vi.fn(),
    updateNotificationState: vi.fn(),
    update: async (v: Reminder) => {
      const index = reminders.findIndex((item) => item.id === v.id);
      if (index < 0) return false;
      reminders[index] = v;
      return true;
    },
  };
  const clock = { now: () => new Date(now) };
  const registry = new AgentToolRegistry(
    taskReminderTools(
      new Tasks(taskRepo, clock, { next: () => 'id' }),
      new Reminders(reminderRepo, clock, { next: () => 'id' }),
    ),
  );
  const executor = new AgentToolExecutor(registry);
  const context = { userId: 'u', conversationId: 'c' };
  expect(
    (await executor.execute({ id: '2', name: 'complete_task', input: { title: 'Revisar' } }, context))
      .error,
  ).toBe('completion_target_not_found_or_ambiguous');
  const completed = await executor.execute(
    { id: '1', name: 'complete_task', input: { title: 'Revisar staging' } },
    context,
  );
  expect(completed.output).toMatchObject({
    tasks: [{ id: 't1', status: 'completed' }],
    completedReminders: [{ id: 'r1', status: 'completed' }],
  });
  reminders[0] = { ...reminders[0]!, status: 'active', updatedAt: now };
  const reminderDone = await executor.execute(
    { id: '3', name: 'complete_reminder', input: { title: 'veterinario' } },
    context,
  );
  expect(reminderDone.output).toMatchObject({ reminders: [{ id: 'r1', status: 'completed' }] });
});
