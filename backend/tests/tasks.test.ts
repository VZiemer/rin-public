import { expect, test } from 'vitest';
import { Tasks } from '../src/application/use-cases/tasks.js';
import type { Task } from '../src/domain/model/contracts.js';
test('creates, completes and cancels tasks with ownership and terminal state checks', async () => {
  const records = new Map<string, Task>();
  let n = 0;
  const tasks = new Tasks(
    {
      get: async (u, id) => records.get(u + id) ?? null,
      list: async (u) => [...records.values()].filter((v) => v.userId === u),
      create: async (v) => {
        records.set(v.userId + v.id, v);
      },
      update: async (v, status) => {
        if (records.get(v.userId + v.id)?.status !== status) return false;
        records.set(v.userId + v.id, v);
        return true;
      },
    },
    { now: () => new Date('2026-01-01') },
    { next: () => String(++n) },
  );
  const task = await tasks.create('u', { title: ' Consulta ' });
  expect(task.title).toBe('Consulta');
  await expect(tasks.get('other', task.id)).rejects.toThrow('not_found');
  expect((await tasks.change('u', task.id, 'completed')).status).toBe('completed');
  await expect(tasks.change('u', task.id, 'cancelled')).rejects.toThrow('closed');
  const second = await tasks.create('u', { title: 'x' });
  expect((await tasks.change('u', second.id, 'cancelled')).status).toBe('cancelled');
  await expect(tasks.create('u', { title: '' })).rejects.toThrow();
});
