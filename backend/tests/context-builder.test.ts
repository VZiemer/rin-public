import { expect, test, vi } from 'vitest';
import { AgentContextBuilder, type ContextRepositories } from '../src/application/agent/context-builder.js';
import { parseSeed } from '../src/adapters/outbound/seed/parser.js';
import { readFileSync } from 'node:fs';
import type { RelationshipRepository } from '../src/application/ports/context.js';
export function contextFixture() {
  const names = [
    'persona/personality.md',
    'persona/behavior-rules.md',
    'persona/relationship.md',
    'persona/yui-relationship.md',
    'assistants/rin.md',
    'assistants/yui.md',
    'user-context/profile.md',
    'user-context/routine.md',
    'user-context/relationships.md',
  ];
  const b = parseSeed(
    Object.fromEntries(names.map((n) => [n, readFileSync(`seed/${n}`, 'utf8')])),
    'u',
    '2026-01-01T00:00:00Z',
  );
  const singleton = <T>(v: T) => ({ get: vi.fn(async () => v), put: vi.fn(async () => true) });
  return {
    ...({} as Pick<ContextRepositories, 'assistants'>),
    persona: singleton(b.persona),
    profile: singleton(b.profile),
    relationship: { ...singleton(b.relationship), get: vi.fn<RelationshipRepository['get']>(async () => b.relationship) },
    routine: singleton(b.routine),
    people: { ...singleton(b.people[0]!), list: vi.fn(async () => b.people) },
  };
}
test('builds from repositories and limits memory, excluding expired context', async () => {
  const repos = contextFixture();
  const list = vi.fn(async () => []);
  const builder = new AgentContextBuilder(
    repos,
    { get: async () => ({ currentTime: '2026-01-01T00:00:00Z', timezone: 'UTC' }) },
    { get: vi.fn(), put: vi.fn(), delete: vi.fn(), list },
    {
      get: async () => ({
        userId: 'u',
        conversationId: 'c',
        summary: 'expired',
        createdAt: 'now',
        updatedAt: 'now',
        expiresAt: 1,
      }),
      put: vi.fn(),
      lastActivityAt: async () => null,
    },
  );
  const context = await builder.build('u', 'c');
  expect(context.persona.name).toBe('Rin');
  expect(context.workingMemory).toBeNull();
  expect(context.tasks).toEqual([]);
  expect(context.reminders).toEqual([]);
  expect(context.shoppingItems).toEqual([]);
  expect(context.initiativeCue.guidance).toContain('aside');
  expect(list).toHaveBeenCalledWith('u', { limit: 20 });
  expect(repos.persona.get).toHaveBeenCalledWith('u');
  expect(repos.relationship.get).toHaveBeenCalledWith('u', 'RIN');
  expect(context.assistantId).toBe('RIN');
  repos.persona.get.mockResolvedValueOnce(null as never);
  await expect(builder.build('u', 'c')).rejects.toThrow('not initialized');
});

test('new user without seeded profile, relationship or routine gets neutral defaults', async () => {
  const repos = contextFixture();
  repos.profile.get.mockResolvedValue(null as never);
  repos.relationship.get.mockResolvedValue(null as never);
  repos.routine.get.mockResolvedValue(null as never);
  const builder = new AgentContextBuilder(repos, {
    get: async () => ({ currentTime: '2026-01-01T00:00:00Z', timezone: 'UTC' }),
  });
  const context = await builder.build('new-user', 'c', 'YUI');
  expect(context.profile).toMatchObject({ userId: 'new-user', primaryLanguage: 'pt-BR' });
  expect(context.relationship).toMatchObject({ userId: 'new-user', assistant: 'YUI' });
  expect(context.relationship.relationship.join(' ')).toContain('New user');
  expect(context.routine).toMatchObject({ userId: 'new-user', weekdayPatterns: [] });
});

test('builds distinct persona and relationship context for two assistants', async () => {
  const repos = contextFixture();
  const rinPersona = {
    traits: { tsundere: 0.9 },
    core: ['blunt'],
    behavior: { must: ['be useful'] },
  };
  const yuiPersona = {
    traits: { deredere: 0.9 },
    core: ['warm'],
    behavior: { must: ['encourage'] },
  };
  repos.assistants = {
    getById: vi.fn(async (id: string) =>
      id === 'YUI'
        ? {
            id: 'YUI' as const,
            name: 'Yui',
            description: 'Cheerful companion',
            defaultAvatarState: 'SOFT_SMILE' as const,
            personaRef: 'yui',
            enabled: true,
            persona: yuiPersona,
          }
        : {
            id: 'RIN' as const,
            name: 'Rin',
            description: 'Tsundere friend',
            defaultAvatarState: 'NEUTRAL' as const,
            personaRef: 'rin',
            enabled: true,
            persona: rinPersona,
          },
    ),
    listAvailable: vi.fn(async () => []),
    put: vi.fn(),
  };
  repos.relationship.get = vi.fn(async (_user: string, assistantId?: string) => ({
    userId: 'u',
    assistant: assistantId,
    relationship: [`rel-${assistantId}`],
    externalCommunication: [],
    createdAt: 'now',
    updatedAt: 'now',
  }));
  const builder = new AgentContextBuilder(repos, {
    get: async () => ({ currentTime: '2026-01-01T00:00:00Z', timezone: 'UTC' }),
  });
  const rin = await builder.build('u', 'c', 'RIN');
  const yui = await builder.build('u', 'c', 'YUI');
  expect(rin.assistantId).toBe('RIN');
  expect(rin.persona.name).toBe('Rin');
  expect(rin.persona.core).toEqual(['blunt']);
  expect(rin.relationship.relationship).toEqual(['rel-RIN']);
  expect(yui.assistantId).toBe('YUI');
  expect(yui.persona.name).toBe('Yui');
  expect(yui.persona.core).toEqual(['warm']);
  expect(yui.relationship.relationship).toEqual(['rel-YUI']);
});
