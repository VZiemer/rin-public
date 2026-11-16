import { expect, test } from 'vitest';
import { presentSkill } from '../src/application/skills/present.js';
import { supportReply, supportTextAllowed } from '../src/application/skills/support.js';

test('venting does not create tasks and risk points to human help', () => {
  const vent = supportReply('só quero desabafar');
  const ventOutput = presentSkill(vent);
  expect(vent.proposedActions).toEqual([]);
  expect(ventOutput.avatarState).toBe('SOFT_SMILE');
  expect(ventOutput.message).not.toMatch(/1\.|2\./);
  expect(supportTextAllowed(ventOutput.message)).toBe(true);

  const risk = presentSkill(supportReply('não quero mais viver'));
  expect(risk.priority).toBe('HIGH');
  expect(risk.message).toContain('CVV 188');
  expect(risk.message).not.toMatch(/psic[oó]log|diagn[oó]stico|s[oó] precisa de mim/i);
  expect(supportTextAllowed('você só precisa de mim, se afasta deles')).toBe(false);
});
