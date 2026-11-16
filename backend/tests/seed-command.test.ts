import { expect, test, vi } from 'vitest';
import { seedContext } from '../src/adapters/outbound/seed/seed.js';
import { parseSeed } from '../src/adapters/outbound/seed/parser.js';
import { readFileSync } from 'node:fs';
import type { AssistantDefinition } from '../src/domain/model/assistant.js';
test('second seed skips existing records and defaults to insert-missing', async () => {
  const seen = new Set<string>();
  const repo = (name: string) => ({
    get: vi.fn(),
    list: vi.fn(),
    put: vi.fn(async (v: { userId: string; id?: string | undefined; assistant?: string | undefined }, mode?: string) => {
      expect(mode).toBe('insert-missing');
      const key = name + (v.id ?? v.assistant ?? '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  });
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
  const bundle = parseSeed(
    Object.fromEntries(names.map((n) => [n, readFileSync(`seed/${n}`, 'utf8')])),
    'u',
    '2026-01-01T00:00:00Z',
  );
  const assistants = new Map<string, AssistantDefinition>();
  const repos = {
    persona: repo('p'),
    profile: repo('u'),
    relationship: repo('r'),
    routine: repo('t'),
    people: repo('people'),
    assistants: {
      getById: async (id: string) => assistants.get(id) ?? null,
      listAvailable: async () => [],
      put: async (definition: AssistantDefinition) => {
        assistants.set(definition.id, definition);
      },
    },
  };
  expect(await seedContext(bundle, repos)).toEqual({ inserted: 9, skipped: 0 });
  expect(await seedContext(bundle, repos)).toEqual({ inserted: 0, skipped: 9 });
});
