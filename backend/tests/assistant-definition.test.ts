import { expect, test } from 'vitest';
import { assistantDefinitionSchema } from '../src/domain/model/assistant.js';

test('parses a provider-neutral assistant definition', () => {
  const definition = assistantDefinitionSchema.parse({
    id: 'yui',
    name: 'Yui',
    description: 'Cheerful companion',
    defaultAvatarState: 'SOFT_SMILE',
    personaRef: 'yui-persona',
    capabilities: { proactive: true, reminders: true },
  });
  expect(definition).toEqual({
    id: 'YUI',
    name: 'Yui',
    description: 'Cheerful companion',
    defaultAvatarState: 'SOFT_SMILE',
    personaRef: 'yui-persona',
    enabled: true,
    capabilities: { proactive: true, reminders: true },
  });
});

test('rejects Android resource fields and invalid identity', () => {
  expect(() =>
    assistantDefinitionSchema.parse({
      id: 'RIN',
      name: 'Rin',
      description: 'Tsundere friend',
      defaultAvatarState: 'NEUTRAL',
      personaRef: 'rin-persona',
      resourceId: 12,
    }),
  ).toThrow();
  expect(() =>
    assistantDefinitionSchema.parse({
      id: 'USER#dev',
      name: 'Rin',
      description: 'Tsundere friend',
      defaultAvatarState: 'NEUTRAL',
      personaRef: 'rin-persona',
    }),
  ).toThrow();
});
