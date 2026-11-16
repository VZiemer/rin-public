import { expect, test, vi } from 'vitest';
import { AgentContextBuilder } from '../src/application/agent/context-builder.js';
import { Tasks } from '../src/application/use-cases/tasks.js';
import type { Task } from '../src/domain/model/contracts.js';
import { contextFixture } from './context-builder.test.js';

test('a task created while using Rin is visible when the same user uses Yui', async () => {
  const tasks: Task[] = [];
  const useCase = new Tasks(
    {
      get: async (_u, id) => tasks.find((task) => task.id === id) ?? null,
      list: async () => tasks,
      create: async (task) => {
        tasks.push(task);
      },
      update: async () => true,
    },
    { now: () => new Date('2026-01-01T00:00:00Z') },
    { next: () => 'task-1' },
  );
  const created = await useCase.create('u', { title: 'Comprar leite' });
  expect(created).not.toHaveProperty('assistantId');

  const repos = contextFixture();
  repos.assistants = {
    getById: vi.fn(async (id: string) => ({
      id: id === 'YUI' ? ('YUI' as const) : ('RIN' as const),
      name: id === 'YUI' ? 'Yui' : 'Rin',
      description: 'assistant',
      defaultAvatarState: 'NEUTRAL' as const,
      personaRef: id,
      enabled: true,
    })),
    listAvailable: vi.fn(async () => []),
    put: vi.fn(),
  };
  const working = {
    get: vi.fn(async (_u: string, conversationId: string, assistantId = 'RIN') =>
      assistantId === 'RIN'
        ? {
            userId: 'u',
            conversationId,
            assistantId: 'RIN',
            summary: 'Rin private joke',
            createdAt: 'now',
            updatedAt: 'now',
            expiresAt: 2_000_000_000,
          }
        : null,
    ),
    put: vi.fn(),
    lastActivityAt: async () => null,
  };
  const builder = new AgentContextBuilder(
    repos,
    { get: async () => ({ currentTime: '2026-01-01T00:00:00Z', timezone: 'UTC' }) },
    undefined,
    working,
    {
      get: async (_u, id) => tasks.find((task) => task.id === id) ?? null,
      list: async () => tasks,
      create: async () => {},
      update: async () => true,
    },
  );
  const rin = await builder.build('u', 'c-rin', 'RIN');
  const yui = await builder.build('u', 'c-yui', 'YUI');
  expect(rin.tasks.map((task) => task.title)).toEqual(['Comprar leite']);
  expect(yui.tasks.map((task) => task.title)).toEqual(['Comprar leite']);
  expect(rin.workingMemory?.summary).toBe('Rin private joke');
  expect(yui.workingMemory).toBeNull();
  expect(rin.assistantId).toBe('RIN');
  expect(yui.assistantId).toBe('YUI');
});
