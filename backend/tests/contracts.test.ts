import { expect, test } from 'vitest';
import type { AgentOutput, Reminder, Task } from '../src/domain/model/contracts.js';
test('task and reminder remain distinct domain concepts', () => {
  const base = {
    id: '1',
    userId: 'u',
    title: 'Consulta',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  const task: Task = { ...base, status: 'pending' };
  const reminder: Reminder = {
    ...base,
    status: 'active',
    scheduledAt: '2026-01-02T09:00:00Z',
    relatedTaskId: task.id,
  };
  const output: AgentOutput = {
    message: 'Pronto',
    avatarState: 'NEUTRAL',
    priority: 'NORMAL',
    actions: [],
  };
  expect(reminder.relatedTaskId).toBe(task.id);
  expect(output.actions).toEqual([]);
});
