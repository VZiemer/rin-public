import { expect, test, vi } from 'vitest';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { InMemoryAssistantRepository } from '../src/adapters/outbound/memory/assistant-repository.js';
import { AssistantPreferences } from '../src/application/use-cases/assistant-preferences.js';
import { Tasks } from '../src/application/use-cases/tasks.js';
import type { Task, UserProfile, WorkingMemory } from '../src/domain/model/contracts.js';
import { event } from './http-fixture.js';

function assistant(id: 'RIN' | 'YUI', enabled = true) {
  return {
    id,
    name: id === 'YUI' ? 'Yui' : 'Rin',
    description: id === 'YUI' ? 'Cheerful companion' : 'Tsundere friend',
    defaultAvatarState: id === 'YUI' ? ('SOFT_SMILE' as const) : ('NEUTRAL' as const),
    personaRef: id.toLowerCase(),
    enabled,
    persona: {
      traits: id === 'YUI' ? { deredere: 0.9, sarcasm: 0.1 } : { tsundere: 0.7, sarcasm: 0.7 },
      core: id === 'YUI' ? ['warm'] : ['blunt'],
      behavior: { must: ['be useful'] },
    },
  };
}

test('covers listing, default, switching, shared tasks, isolated memory and unknown assistants', async () => {
  const assistants = new InMemoryAssistantRepository();
  await assistants.put(assistant('RIN'));
  await assistants.put(assistant('YUI'));
  const tasks: Task[] = [];
  const taskUseCase = new Tasks(
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
  await taskUseCase.create('u', { title: 'Comprar leite' });
  const memories = new Map<string, WorkingMemory>();
  const working = {
    get: async (_u: string, conversationId: string, assistantId = 'RIN') =>
      memories.get(`${assistantId}#${conversationId}`) ?? null,
    put: async (value: WorkingMemory) => {
      memories.set(`${value.assistantId ?? 'RIN'}#${value.conversationId}`, value);
    },
    lastActivityAt: async () => null,
  };
  await working.put({
    userId: 'u',
    conversationId: 'chat',
    assistantId: 'RIN',
    summary: 'Rin private joke',
    createdAt: 'now',
    updatedAt: 'now',
    expiresAt: 2_000_000_000,
  });
  expect(await working.get('u', 'chat', 'RIN')).toMatchObject({ summary: 'Rin private joke' });
  expect(await working.get('u', 'chat', 'YUI')).toBeNull();

  const profile: UserProfile = {
    userId: 'u',
    primaryLanguage: 'pt-BR',
    professionalLanguage: 'pt-BR',
    work: [],
    technology: [],
    workingStyle: [],
    createdAt: 'now',
    updatedAt: 'now',
  };
  const prefs = new AssistantPreferences(
    {
      get: async () => profile,
      put: async (value) => {
        Object.assign(profile, value);
        return true;
      },
    },
    assistants,
  );
  expect((await assistants.listAvailable()).map((item) => item.id)).toEqual(['RIN', 'YUI']);
  expect(await prefs.getDefault('u')).toBe('RIN');
  expect(await prefs.setDefault('u', 'YUI')).toBe('YUI');

  const execute = vi.fn(async (_userId: string, message: string, _c: string, input: { assistantId?: string }) => ({
    message: `${input.assistantId}: ${message}`,
    avatarState: 'NEUTRAL' as const,
    priority: 'NORMAL' as const,
    actions: [],
    assistantId: input.assistantId,
  }));
  const handler = createHandler({
    environment: 'dev',
    devUserId: 'u',
    allowDevUserFallback: true,
    ids: { next: () => 'c' },
    assistants,
    agent: { execute },
    assistantPreferences: prefs,
  });

  const listed = await assistants.listAvailable();
  expect(listed).toHaveLength(2);
  const rin = await handler(event('POST', '/agent/message', { message: 'oi', assistantId: 'RIN' }));
  const yui = await handler(event('POST', '/agent/message', { message: 'oi', assistantId: 'YUI' }));
  expect(JSON.parse(rin.body as string).assistantId).toBe('RIN');
  expect(JSON.parse(yui.body as string).assistantId).toBe('YUI');
  expect((await taskUseCase.list('u')).map((task) => task.title)).toEqual(['Comprar leite']);
  const unknown = await handler(event('POST', '/agent/message', { message: 'oi', assistantId: 'NOPE' }));
  expect(unknown.statusCode).toBe(404);
  expect(JSON.parse(unknown.body as string).code).toBe('ASSISTANT_NOT_FOUND');
});
