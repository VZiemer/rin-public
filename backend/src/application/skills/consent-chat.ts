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
  if (/\b(apaga isso|nao quero que guarde|revoga)\b/.test(text))
    return erase(consents, followUps, turn);
  if (text.includes('pode guardar'))
    return grant(
      consents,
      followUps,
      ids,
      turn,
      'store_preference',
      'Vou guardar só essa preferência, por pouco tempo.',
    );
  if (text.includes('pode me chamar depois') || text.includes('depois me pergunta'))
    return grant(
      consents,
      followUps,
      ids,
      turn,
      'follow_up_push',
      'Posso chamar depois, com uma mensagem discreta.',
    );
  if (text.includes('so conversar agora') || text.includes('vamos conversar agora')) {
    return grant(
      consents,
      followUps,
      ids,
      turn,
      'talk_now',
      'Então a gente conversa agora. Não vou guardar nem chamar depois por causa disso.',
    );
  }
  if (text.includes('nao precisa me chamar')) return declineFollowUp(consents, followUps, turn);
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
      nextStep: 'retomar a conversa com uma mensagem discreta, se a pessoa quiser',
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
        ? 'Conversar agora não autoriza memória permanente nem um push.'
        : 'Silêncio não entra como autorização.',
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
    facts: [{ id: 'erased', statement: 'Apaguei o que estava guardado sobre isso.' }],
    calculated: [],
    explanations: ['Não vou usar silêncio nem essa recusa como sinal de piora.'],
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
    facts: [{ id: 'declined', statement: 'Tudo bem. Não vou chamar por causa disso.' }],
    calculated: [],
    explanations: ['A recusa encerra o acompanhamento, sem cobrança.'],
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
