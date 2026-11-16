import { expect, test, vi } from 'vitest';
import { AgentLoop } from '../src/application/agent/loop.js';
import { AgentToolExecutor, AgentToolRegistry } from '../src/application/agent/tools.js';
import { taskReminderTools } from '../src/application/agent/task-reminder-tools.js';
import { Tasks } from '../src/application/use-cases/tasks.js';
import { Reminders } from '../src/application/use-cases/reminders.js';
import type { Reminder, Task } from '../src/domain/model/contracts.js';
import type { TaskRepository } from '../src/application/ports/task.js';
import type { ReminderRepository } from '../src/application/ports/reminder.js';

const clock = { now: () => new Date('2026-09-14T12:00:00.000Z') };
const ids = { n: 0, next: () => `id-${++ids.n}` };
const ctx = {
  userId: 'user',
  conversationId: 'conversation',
  time: {
    currentTimestamp: '2026-09-14T12:00:00.000Z',
    timezone: 'America/Sao_Paulo',
    localDate: '2026-09-14',
    localWeekday: 'Monday',
  },
};

class MemoryTaskRepo implements TaskRepository {
  items: Task[] = [];
  async get(userId: string, id: string) {
    return this.items.find((item) => item.userId === userId && item.id === id) ?? null;
  }
  async list(userId: string, limit = 100) {
    return this.items.filter((item) => item.userId === userId).slice(0, limit);
  }
  async create(task: Task) {
    this.items.push(task);
  }
  async update(task: Task) {
    const index = this.items.findIndex((item) => item.userId === task.userId && item.id === task.id);
    if (index < 0) return false;
    this.items[index] = task;
    return true;
  }
}

class MemoryReminderRepo implements ReminderRepository {
  items: Reminder[] = [];
  async get(userId: string, id: string) {
    return this.items.find((item) => item.userId === userId && item.id === id) ?? null;
  }
  async list(userId: string, limit = 100) {
    return this.items.filter((item) => item.userId === userId).slice(0, limit);
  }
  async create(reminder: Reminder) {
    this.items.push(reminder);
  }
  async updateNotificationState() {}
  async update(reminder: Reminder) {
    const index = this.items.findIndex(
      (item) => item.userId === reminder.userId && item.id === reminder.id,
    );
    if (index < 0) return false;
    this.items[index] = reminder;
    return true;
  }
}

function fixture() {
  const taskRepo = new MemoryTaskRepo();
  const reminderRepo = new MemoryReminderRepo();
  const tasks = new Tasks(taskRepo, clock, ids);
  const reminders = new Reminders(reminderRepo, clock, ids);
  const registry = new AgentToolRegistry(taskReminderTools(tasks, reminders));
  return { registry, taskRepo, reminderRepo };
}

test('normal conversation and unknown avatar normalization', async () => {
  const { registry } = fixture();
  const generate = vi.fn().mockResolvedValue({
    type: 'final',
    output: { message: 'Oi. Ja veio me atrapalhar?', avatarState: 'mystery', priority: 'normal', actions: [] },
  });
  const output = await new AgentLoop({ generate }, registry, new AgentToolExecutor(registry)).run(
    { systemPrompt: '', message: 'Oi Rin' },
    ctx,
  );
  expect(output.avatarState).toBe('NEUTRAL');
});

test('today summary uses deterministic task and reminder tool results', async () => {
  const { registry, taskRepo, reminderRepo } = fixture();
  taskRepo.items.push({
    id: 'task-1',
    userId: 'user',
    title: 'Review staging deploy',
    status: 'pending',
    createdAt: clock.now().toISOString(),
    updatedAt: clock.now().toISOString(),
  });
  reminderRepo.items.push({
    id: 'reminder-1',
    userId: 'user',
    title: 'Call veterinarian',
    scheduledAt: '2026-09-14T17:00:00.000Z',
    status: 'active',
    createdAt: clock.now().toISOString(),
    updatedAt: clock.now().toISOString(),
  });
  const generate = vi
    .fn()
    .mockResolvedValueOnce({ type: 'tool_call', call: { id: '1', name: 'get_today_items', input: {} } })
    .mockResolvedValue({
      type: 'final',
      output: { message: 'Voce tem deploy e veterinario hoje.', avatarState: 'FOCUSED', priority: 'NORMAL', actions: [] },
    });
  const output = await new AgentLoop({ generate }, registry, new AgentToolExecutor(registry)).run(
    { systemPrompt: '', message: 'O que tenho hoje?' },
    ctx,
  );
  expect(output.message).toContain('deploy');
  expect(generate.mock.calls[1]?.[0].results[0].output).toMatchObject({
    tasks: [{ title: 'Review staging deploy' }],
    reminders: [{ title: 'Call veterinarian' }],
  });
});

test('creates task and reminder through tools', async () => {
  const { registry, taskRepo, reminderRepo } = fixture();
  const executor = new AgentToolExecutor(registry);
  await executor.execute(
    { id: '1', name: 'create_task', input: { title: 'Review staging' } },
    ctx,
  );
  await executor.execute(
    {
      id: '2',
      name: 'create_reminder',
      input: { title: 'Call veterinarian', relativeDay: 'tomorrow', time: '09:00' },
    },
    ctx,
  );
  expect(taskRepo.items[0]?.title).toBe('Review staging');
  expect(reminderRepo.items[0]).toMatchObject({ title: 'Call veterinarian', status: 'active' });
});

test('returns focus and alarm local actions', async () => {
  const { registry } = fixture();
  const focus = {
    type: 'final',
    output: {
      message: 'Vinte e cinco minutos.',
      avatarState: 'SMUG',
      priority: 'NORMAL',
      actions: [{ type: 'LOCAL_TOOL', tool: 'focus.start', payload: { minutes: 25 } }],
    },
  };
  const alarm = {
    type: 'final',
    output: {
      message: 'Alarme das sete.',
      avatarState: 'FOCUSED',
      priority: 'NORMAL',
      actions: [{ type: 'LOCAL_TOOL', tool: 'device.set_alarm', payload: { hour: 7, minute: 0 } }],
    },
  };
  const loop = new AgentLoop(
    { generate: vi.fn().mockResolvedValueOnce(focus).mockResolvedValueOnce(alarm) },
    registry,
    new AgentToolExecutor(registry),
  );
  expect((await loop.run({ systemPrompt: '', message: 'Pomodoro de 25' }, ctx)).actions[0]).toMatchObject({
    tool: 'focus.start',
  });
  expect((await loop.run({ systemPrompt: '', message: 'Alarme 7' }, ctx)).actions[0]).toMatchObject({
    tool: 'device.set_alarm',
  });
});

test('rejects invalid tools and executes writes without confirmation UI', async () => {
  const { registry, taskRepo } = fixture();
  await expect(
    new AgentLoop(
      { generate: vi.fn().mockResolvedValue({ type: 'tool_call', call: { id: 'x', name: 'nope', input: {} } }) },
      registry,
      new AgentToolExecutor(registry),
    ).run({ systemPrompt: '', message: 'use invalid' }, ctx),
  ).rejects.toThrow('unknown_tool');
  const generate = vi
    .fn()
    .mockResolvedValueOnce({
      type: 'tool_call',
      call: { id: '1', name: 'create_task', input: { title: 'Confirm me' } },
    })
    .mockResolvedValue({
      type: 'final',
      output: { message: 'feito', avatarState: 'SMUG', priority: 'NORMAL', actions: [] },
    });
  await new AgentLoop({ generate }, registry, new AgentToolExecutor(registry)).run(
    { systemPrompt: '', message: 'add task' },
    ctx,
  );
  expect(taskRepo.items[0]?.title).toBe('Confirm me');
});
