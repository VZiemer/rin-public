import { expect, test } from 'vitest';
import { InMemoryActiveSubjectRepository } from '../src/adapters/outbound/memory/active-subject-repository.js';
import { rememberSelection, selectSkill } from '../src/application/skills/select-intent.js';
import type { ActiveSubject } from '../src/domain/skills/subject.js';

const now = new Date('2026-10-11T15:00:00.000Z');

function input(message: string, active: ActiveSubject | null = null, anchors = [] as { skillId: 'finance' | 'support'; ref: string; at: string }[]) {
  return {
    message,
    now,
    active,
    anchors,
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
  };
}

test('distress about debt prioritizes listening and keeps finance as secondary', () => {
  const choice = selectSkill(input('as dívidas estão me deixando desesperado'));
  expect(choice.primary).toBe('support');
  expect(choice.secondary).toBe('finance');
  expect(choice.endedPrevious).toBe(false);
});

test('an explicit topic change ends the previous selection', () => {
  const active = rememberSelection(
    input('gastei 10 reais'),
    selectSkill(input('gastei 10 reais')),
  );
  const choice = selectSkill(input('esquece as dívidas, vamos falar do jantar', active));
  expect(choice.primary).toBe('conversation');
  expect(choice.endedPrevious).toBe(true);
  expect(choice.reason).toBe('explicit');
});

test('references resolve from anchors and the active subject, not from a keyword alone', () => {
  const bare = selectSkill(
    input('e aquele?', null, [{ skillId: 'finance', ref: 'entry-1', at: now.toISOString() }]),
  );
  expect(bare).toMatchObject({ primary: 'finance', reason: 'reference' });

  const noContext = selectSkill(input('e aquele?'));
  expect(noContext.primary).toBe('conversation');

  const support = rememberSelection(input('quero desabafar'), selectSkill(input('quero desabafar')));
  expect(selectSkill(input('continua', support))).toMatchObject({
    primary: 'support',
    reason: 'continued',
    endedPrevious: false,
  });
});

test('expired subject does not continue and records stay isolated', async () => {
  const repo = new InMemoryActiveSubjectRepository();
  const choice = selectSkill(input('quero desabafar'));
  const subject = rememberSelection(input('quero desabafar'), choice);
  subject.expiresAt = '2026-10-11T14:00:00.000Z';
  await repo.put(subject);
  const stored = await repo.get('user-a', 'RIN', 'c1');
  expect(selectSkill(input('continua', stored)).primary).toBe('conversation');
  expect(await repo.get('user-b', 'RIN', 'c1')).toBeNull();
  expect(await repo.get('user-a', 'YUI', 'c1')).toBeNull();
});
