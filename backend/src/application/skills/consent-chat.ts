import {
  consentExpiry,
  type ConsentPurpose,
  type SupportConsent,
} from '../../domain/skills/consent.js';
import type { SkillResult } from '../../domain/skills/definition.js';
import type { FollowUpRepository } from '../ports/follow-up.js';
import type { SupportConsentRepository } from '../ports/support-consent.js';
import type { IdGenerator } from '../ports/runtime.js';
import type { SkillTurn, SkillTurnHandler } from './runtime.js';

export function supportConsentChat(
  consents: SupportConsentRepository,
  followUps: FollowUpRepository,
  ids: IdGenerator,
): SkillTurnHandler {
  return {
    skillId: 'support',
    handle: (turn) => handleConsent(consents, followUps, ids, turn),
  };
}

export async function handleConsent(
  consents: SupportConsentRepository,
  followUps: FollowUpRepository,
  ids: IdGenerator,
  turn: SkillTurn,
): Promise<SkillResult | null> {
  if (turn.selection.primary !== 'support') return null;
  const text = normalize(turn.message);
  if (text === '' || text === '...' || text === '.') return null;
  if (/\b(delete this|do not save this|revoke|apaga isso|nao quero que guarde|revoga)\b/.test(text))
    return erase(consents, followUps, turn);
  if (text.includes('pode guardar') || text === 'you can save this preference')
    return grant(
      consents,
      followUps,
      ids,
      turn,
      'store_preference',
      'I will save only this preference, for a short time.',
    );
  if (text.includes('pode me chamar depois') || text.includes('depois me pergunta') || text === 'you can check in later' || text === 'ask me later')
    return grant(
      consents,
      followUps,
      ids,
      turn,
      'follow_up_push',
      'I can check in later with a discreet message.',
    );
  if (text.includes('so conversar agora') || text.includes('vamos conversar agora') || text === 'just talk now') {
    return grant(
      consents,
      followUps,
      ids,
      turn,
      'talk_now',
      'Then let us talk now. I will not save this or contact you later because of it.',
    );
  }
  if (text.includes('nao precisa me chamar') || text === 'do not check in later') return declineFollowUp(consents, followUps, turn);
  return null;
}

async function grant(
  consents: SupportConsentRepository,
  followUps: FollowUpRepository,
  ids: IdGenerator,
  turn: SkillTurn,
  purpose: ConsentPurpose,
  statement: string,
): Promise<SkillResult> {
  const at = turn.now.toISOString();
  const consent: SupportConsent = {
    id: ids.next(),
    userId: turn.userId,
    assistantId: turn.assistantId,
    purpose,
    subject: turn.selection.primary,
    status: 'granted',
    grantedAt: at,
    expiresAt: consentExpiry(purpose, turn.now),
    createdAt: at,
    updatedAt: at,
  };
  await consents.put(consent);
  if (purpose === 'follow_up_push') {
    await followUps.put({
      id: consent.id,
      userId: turn.userId,
      assistantId: turn.assistantId,
      skillId: 'support',
      origin: 'user_request',
      subject: consent.subject,
      nextStep: 'resume the conversation with a discreet message if the person wants to',
      authorization: 'accepted',
      status: 'accepted',
      kind: 'commitment',
      supportConsentId: consent.id,
      windowStart: new Date(turn.now.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      windowEnd: consent.expiresAt,
      createdAt: at,
      updatedAt: at,
    });
  }
  return {
    skillId: 'support',
    facts: [{ id: consent.id, statement }],
    calculated: [],
    explanations: [
      purpose === 'talk_now'
        ? 'Talking now does not authorize permanent memory or a push notification.'
        : 'Silence is not authorization.',
    ],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'gentle', allowSarcasm: false },
  };
}

async function erase(
  consents: SupportConsentRepository,
  followUps: FollowUpRepository,
  turn: SkillTurn,
): Promise<SkillResult> {
  const records = await consents.list(turn.userId, turn.assistantId);
  for (const record of records) await consents.delete(turn.userId, turn.assistantId, record.id);
  const open = await followUps.list(turn.userId, turn.assistantId);
  for (const followUp of open.filter(
    (item) => item.skillId === 'support' && ['accepted', 'postponed'].includes(item.status),
  )) {
    await followUps.put({
      ...followUp,
      status: 'cancelled',
      authorization: 'refused',
      updatedAt: turn.now.toISOString(),
    });
  }
  return {
    skillId: 'support',
    facts: [{ id: 'erased', statement: 'I deleted what was saved about this.' }],
    calculated: [],
    explanations: ['I will not treat silence or this refusal as a sign of deterioration.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'gentle', allowSarcasm: false },
  };
}

async function declineFollowUp(
  consents: SupportConsentRepository,
  followUps: FollowUpRepository,
  turn: SkillTurn,
): Promise<SkillResult> {
  const records = (await consents.list(turn.userId, turn.assistantId)).filter(
    (item) => item.purpose === 'follow_up_push',
  );
  for (const record of records) {
    await consents.put({ ...record, status: 'revoked', updatedAt: turn.now.toISOString() });
  }
  const open = await followUps.list(turn.userId, turn.assistantId);
  for (const followUp of open.filter((item) => item.skillId === 'support')) {
    await followUps.put({
      ...followUp,
      status: 'refused',
      authorization: 'refused',
      updatedAt: turn.now.toISOString(),
    });
  }
  return {
    skillId: 'support',
    facts: [{ id: 'declined', statement: 'All right. I will not contact you about this.' }],
    calculated: [],
    explanations: ['Refusing ends the follow-up without pressure.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'gentle', allowSarcasm: false },
  };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
