import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseSeed } from '../src/adapters/outbound/seed/parser.js';
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
const files = Object.fromEntries(names.map((name) => [name, readFileSync(`seed/${name}`, 'utf8')]));
test('normalizes versioned defaults and unresolved people', () => {
  const result = parseSeed(files, 'u', '2026-01-01T00:00:00Z');
  expect(result.persona.traits.tsundere).toBe(0.7);
  expect(result.profile.primaryLanguage).toBe('en-US');
  expect(result.people[0]?.name).toBeNull();
  expect(result.people[1]?.name).toBe('Example Person');
  expect(result.assistants.map((assistant) => assistant.id)).toEqual(['RIN', 'YUI']);
  expect(result.assistants[0]?.persona?.traits.tsundere).toBe(0.7);
  expect(result.assistants[1]?.persona?.traits.deredere).toBe(0.9);
  expect(result.assistants[1]?.persona?.traits.sarcasm).toBe(0.1);
  expect(result.relationship.assistant).toBe('RIN');
  expect(result.assistantRelationships[0]?.assistant).toBe('YUI');
});
test('rejects missing and malformed seed before writing', () => {
  expect(() => parseSeed({}, 'u', '2026-01-01T00:00:00Z')).toThrow();
  expect(() =>
    parseSeed({ ...files, 'persona/personality.md': 'name: [bad' }, 'u', '2026-01-01T00:00:00Z'),
  ).toThrow();
});
