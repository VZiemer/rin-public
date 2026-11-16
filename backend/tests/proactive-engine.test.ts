import { expect, test } from 'vitest';
import { InMemorySkillThreadRepository } from '../src/adapters/outbound/memory/skill-thread-repository.js';
import { selectSkill } from '../src/application/skills/select-intent.js';
import { SkillProactiveDispatcher } from '../src/application/skills/proactive-dispatch.js';
import {
  chooseInitiative,
  threadAnchors,
  type InitiativeProposal,
  type ProactiveGate,
} from '../src/application/skills/proactive-engine.js';

const now = new Date('2026-10-11T15:00:00.000Z');

function proposal(partial: Partial<InitiativeProposal> = {}): InitiativeProposal {
  return {
    id: 'bill-1',
    userId: 'user-a',
    assistantId: 'RIN',
    skillId: 'finance',
    cooldownKey: 'bill:1',
    relevance: 0.8,
    reasonCode: 'due_bill',
    factualContext: { dueInDays: 1 },
    text: 'Tem uma conta chegando.',
    notBefore: now.toISOString(),
    priority: 'NORMAL',
    ...partial,
  };
}

function gate(partial: Partial<ProactiveGate> = {}): ProactiveGate {
  return {
    now,
    localTime: '15:00',
    quietStart: '22:00',
    quietEnd: '08:00',
    maxPerDay: 2,
    sentToday: 0,
    pausedSkills: [],
    recentKeys: [],
    cooldownMs: 60 * 60 * 1000,
    reminderDueSoon: false,
    moodCronSentToday: false,
    ...partial,
  };
}

test('initiatives respect quiet hours, reminders, cooldown and mood', () => {
  expect(chooseInitiative([proposal()], gate({ localTime: '23:10' })).reason).toBe('quiet_hours');
  expect(chooseInitiative([proposal()], gate({ reminderDueSoon: true })).reason).toBe('reminder_priority');
  expect(
    chooseInitiative([proposal()], gate({ recentKeys: [{ key: 'bill:1', at: now.toISOString() }] })).reason,
  ).toBe('cooldown');
  expect(
    chooseInitiative([proposal({ relevance: 0.4 })], gate({ moodCronSentToday: true })).reason,
  ).toBe('low_relevance');
  expect(chooseInitiative([proposal({ id: 'low', relevance: 0.4 }), proposal()], gate()).proposal.id).toBe('bill-1');
});

test('a failed send is not marked delivered and a sent thread resumes in another conversation', async () => {
  const repo = new InMemorySkillThreadRepository();
  const events: string[] = [];
  const dispatcher = new SkillProactiveDispatcher(repo, {
    event: (_name, fields) => events.push(JSON.stringify(fields)),
  });
  const failed = await dispatcher.dispatch([proposal({ text: 'divida secreta 900' })], gate(), async () => {
    throw new Error('push down');
  });
  expect(failed.status).toBe('failed');
  expect((await repo.listRecent('user-a', 'RIN', 5))[0]?.sentAt).toBeUndefined();
  expect(events.join(' ')).not.toContain('divida');

  const sent = await dispatcher.dispatch([proposal({ id: 'bill-2', cooldownKey: 'bill:2' })], gate(), async () => true);
  expect(sent.status).toBe('sent');
  const anchors = threadAnchors(await repo.listRecent('user-a', 'RIN', 5));
  const resumed = selectSkill({
    message: 'e aquele?',
    now,
    active: null,
    anchors,
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'outra-conversa',
  });
  expect(resumed).toMatchObject({ primary: 'finance', reason: 'reference' });
});
