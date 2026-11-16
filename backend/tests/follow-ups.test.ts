import { expect, test } from 'vitest';
import { InMemoryFollowUpRepository } from '../src/adapters/outbound/memory/follow-up-repository.js';
import { canApproach } from '../src/domain/skills/follow-up.js';
import { handleFollowUp, suggestFollowUp } from '../src/application/skills/follow-ups.js';
import type { SkillTurn } from '../src/application/skills/runtime.js';

const now = new Date('2026-10-11T15:00:00.000Z');
let n = 0;

function turn(message: string): SkillTurn {
  return {
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
    message,
    now,
    selection: { primary: 'finance', reason: 'continued', endedPrevious: false },
    projection: { skillId: 'finance', records: [], workingSummary: null, omitted: [] },
  };
}

test('a request to ask later is a commitment and a suggestion is not', async () => {
  const repo = new InMemoryFollowUpRepository();
  const ids = { next: () => `f-${n++}` };
  const created = await handleFollowUp(repo, ids, turn('depois me pergunta sobre isso'));
  expect(created?.facts[0]?.statement).toMatch(/as agreed/);
  const stored = (await repo.list('user-a', 'RIN'))[0];
  expect(stored && canApproach(stored, now)).toBe(true);
  expect(await repo.list('user-b', 'RIN')).toEqual([]);

  const suggestion = suggestFollowUp({
    userId: 'user-a',
    assistantId: 'RIN',
    skillId: 'finance',
    subject: 'revisar gastos',
    now,
    id: 'sug',
  });
  expect(canApproach(suggestion, now)).toBe(false);
  await repo.put(suggestion);

  const refused = await handleFollowUp(repo, ids, turn('não precisa'));
  expect(refused?.facts[0]?.statement).toMatch(/I will not insist/i);
  const postponed = await handleFollowUp(repo, ids, turn('depois me pergunta sobre isso'));
  await handleFollowUp(repo, ids, turn('deixa pra semana que vem'));
  const later = (await repo.list('user-a', 'RIN')).find((item) => item.id === postponed?.facts[0]?.id);
  expect(later && canApproach(later, now)).toBe(false);
  expect(later && canApproach(later, new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000))).toBe(true);
});
