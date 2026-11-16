import { expect, test } from 'vitest';
import { InMemorySkillEnablementRepository } from '../src/adapters/outbound/memory/skill-enablement-repository.js';
import { SkillEnablement } from '../src/application/skills/enablement.js';
import { createSkillRegistry } from '../src/application/skills/catalog.js';
import { presentSkill } from '../src/application/skills/present.js';
import { skillFailureOutput } from '../src/application/skills/runtime.js';
import { agentOutputSchema } from '../src/domain/model/validation.js';

test('the MVP answer stays compatible and each skill can be disabled alone', async () => {
  const failure = agentOutputSchema.parse(skillFailureOutput());
  expect(failure).toMatchObject({
    message: expect.stringMatching(/Nada foi registrado/),
    actions: [],
  });
  expect(failure).not.toHaveProperty('skillId');

  const shown = agentOutputSchema.parse(
    presentSkill({
      skillId: 'finance',
      facts: [{ id: 'n', statement: 'Total conferido.' }],
      calculated: [{ id: 'v', label: 'Delivery', amountMinor: 4200, currency: 'BRL' }],
      explanations: [],
      missing: [],
      proposedActions: [],
      tone: { intensity: 'measured', allowSarcasm: false },
    }),
  );
  expect(shown.message).toContain('R$ 42,00');
  expect(shown.actions).toEqual([]);

  const registry = createSkillRegistry();
  const enablement = new SkillEnablement(registry, new InMemorySkillEnablementRepository());
  const now = new Date('2026-10-11T15:00:00.000Z');
  await enablement.setEnabled('user-a', 'RIN', 'finance', false, now);
  expect((await enablement.resolve('user-a', 'RIN', 'finance')).enabled).toBe(false);
  expect((await enablement.resolve('user-a', 'RIN', 'support')).enabled).toBe(true);
  expect((await enablement.resolve('user-a', 'YUI', 'finance')).enabled).toBe(true);
});
