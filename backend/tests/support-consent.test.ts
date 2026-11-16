import { expect, test } from 'vitest';
import { InMemoryFollowUpRepository } from '../src/adapters/outbound/memory/follow-up-repository.js';
import { InMemorySupportConsentRepository } from '../src/adapters/outbound/memory/support-consent-repository.js';
import { handleConsent } from '../src/application/skills/consent-chat.js';
import { consentExpiry } from '../src/domain/skills/consent.js';
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
    selection: { primary: 'support', reason: 'explicit', endedPrevious: false },
    projection: { skillId: 'support', records: [], workingSummary: null, omitted: [] },
  };
}

test('silence grants nothing and each purpose expires on its own clock', async () => {
  const consents = new InMemorySupportConsentRepository();
  const followUps = new InMemoryFollowUpRepository();
  const ids = { next: () => `c-${n++}` };
  expect(await handleConsent(consents, followUps, ids, turn('...'))).toBeNull();
  expect(await consents.list('user-a', 'RIN')).toEqual([]);

  await handleConsent(consents, followUps, ids, turn('vamos só conversar agora'));
  await handleConsent(consents, followUps, ids, turn('pode guardar isso'));
  await handleConsent(consents, followUps, ids, turn('pode me chamar depois'));
  const stored = await consents.list('user-a', 'RIN');
  const byPurpose = Object.fromEntries(stored.map((item) => [item.purpose, item.expiresAt]));
  expect(byPurpose.talk_now).toBe(consentExpiry('talk_now', now));
  expect(byPurpose.store_preference).toBe(consentExpiry('store_preference', now));
  expect(byPurpose.follow_up_push).toBe(consentExpiry('follow_up_push', now));
  expect(await consents.list('user-b', 'RIN')).toEqual([]);

  const declined = await handleConsent(consents, followUps, ids, turn('não precisa me chamar'));
  expect(declined?.facts[0]?.statement).toBe('All right. I will not contact you about this.');
  expect(declined?.facts[0]?.statement).not.toMatch(/deveria|culpa|pior/i);
  await handleConsent(consents, followUps, ids, turn('apaga isso'));
  expect(await consents.list('user-a', 'RIN')).toEqual([]);
});
