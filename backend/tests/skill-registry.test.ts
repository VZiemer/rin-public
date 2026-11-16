import { expect, test } from 'vitest';
import { InMemorySkillEnablementRepository } from '../src/adapters/outbound/memory/skill-enablement-repository.js';
import { SkillEnablement } from '../src/application/skills/enablement.js';
import { createSkillRegistry } from '../src/application/skills/catalog.js';
import { SkillRegistry } from '../src/application/skills/registry.js';
import type { AgentOutput } from '../src/domain/model/contracts.js';
import { builtinSkillDefinitions } from '../src/application/skills/catalog.js';
import type { SkillDefinition } from '../src/domain/skills/definition.js';

test('registering a skill leaves the Android output contract unchanged', () => {
  const registry = new SkillRegistry();
  for (const definition of builtinSkillDefinitions()) registry.register(definition);
  const output: AgentOutput = {
    message: 'oi',
    avatarState: 'NEUTRAL',
    priority: 'NORMAL',
    actions: [],
  };
  expect(output).not.toHaveProperty('skillId');
  expect(registry.list().map((skill) => skill.id)).toEqual(['flirt', 'conversation', 'finance', 'support']);
  expect(registry.get('finance').fallbackSkillId).toBe('conversation');
});

test('a disabled skill cannot execute and conversation stays available', async () => {
  const registry = createSkillRegistry();
  const enablement = new SkillEnablement(registry, new InMemorySkillEnablementRepository());
  const now = new Date('2026-10-11T12:00:00.000Z');
  const defaults = await enablement.resolve('user-a', 'RIN', 'finance');
  expect(defaults).toMatchObject({ enabled: true, source: 'default' });
  registry.assertExecutable(defaults);

  await enablement.setEnabled('user-a', 'RIN', 'finance', false, now);
  const disabled = await enablement.resolve('user-a', 'RIN', 'finance');
  expect(disabled).toMatchObject({ enabled: false, source: 'user' });
  expect(() => registry.assertExecutable(disabled)).toThrow('skill_disabled');

  const otherAssistant = await enablement.resolve('user-a', 'YUI', 'finance');
  expect(otherAssistant.enabled).toBe(true);
  const otherUser = await enablement.resolve('user-b', 'RIN', 'finance');
  expect(otherUser.enabled).toBe(true);

  await expect(enablement.setEnabled('user-a', 'RIN', 'conversation', false, now)).rejects.toThrow(
    'skill_required',
  );
  const conversation = await enablement.resolve('user-a', 'RIN', 'conversation');
  expect(conversation.enabled).toBe(true);
  registry.assertExecutable(conversation);
});

test('duplicate registration fails without a second agent loop', () => {
  const registry = createSkillRegistry();
  const again: SkillDefinition = { ...registry.get('support') };
  expect(() => registry.register(again)).toThrow('Duplicate skill');
});
