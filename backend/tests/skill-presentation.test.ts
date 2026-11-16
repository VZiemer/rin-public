import { expect, test } from 'vitest';
import { presentSkill, renderSkillMessage } from '../src/application/skills/present.js';
import { agentOutputSchema } from '../src/domain/model/validation.js';
import type { SkillResult } from '../src/domain/skills/definition.js';

const spent: SkillResult = {
  skillId: 'finance',
  facts: [{ id: 'src', statement: 'O total soma as despesas ativas do mês.' }],
  calculated: [{ id: 'delivery', label: 'Delivery no mês', amountMinor: 4200, currency: 'BRL' }],
  explanations: [],
  missing: [],
  proposedActions: [],
  tone: { intensity: 'casual', allowSarcasm: true },
};

const distress: SkillResult = {
  skillId: 'support',
  facts: [{ id: 'heard', statement: 'Você quer desabafar, sem uma lista de tarefas.' }],
  calculated: [],
  explanations: [],
  missing: [],
  proposedActions: [],
  tone: { intensity: 'gentle', allowSarcasm: false },
};

test('sarcasm cannot change a calculated amount', () => {
  const honest = presentSkill(spent);
  expect(honest.message).toContain('R$ 42,00');
  expect(honest.avatarState).toBe('SMUG');
  const twisted = presentSkill(spent, 'Que surpresa, foram R$ 43,00 e eu já transferi.');
  expect(twisted.message).toContain('R$ 42,00');
  expect(twisted.message).not.toContain('43,00');
  expect(twisted.message).not.toMatch(/transferi/i);
  expect(agentOutputSchema.parse(twisted).actions).toEqual([]);
});

test('hostile sarcasm is dropped when the subject is suffering', () => {
  const output = presentSkill(distress, 'Que frescura. Para de drama.');
  expect(output.message).not.toMatch(/frescura|drama/i);
  expect(output.avatarState).toBe('FOCUSED');
  expect(output.message).toMatch(/não vou afirmar|Nao vou afirmar|desabafar/i);
  const direct = presentSkill(distress);
  expect(direct.avatarState).toBe('SOFT_SMILE');
  expect(direct.message).toContain('desabafar');
  expect(renderSkillMessage(distress)).not.toMatch(/frescura/i);
});
