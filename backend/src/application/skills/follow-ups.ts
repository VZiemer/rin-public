import { canApproach, type FollowUp } from '../../domain/skills/follow-up.js';
import type { SkillResult } from '../../domain/skills/definition.js';
import type { FollowUpRepository } from '../ports/follow-up.js';
import type { IdGenerator } from '../ports/runtime.js';
import type { SkillTurn, SkillTurnHandler } from './runtime.js';

const OPEN = new Set<FollowUp['status']>(['suggested', 'accepted', 'postponed']);

export function followUpHandler(repo: FollowUpRepository, ids: IdGenerator): SkillTurnHandler {
  return {
    skillId: 'conversation',
    handle: (turn) => handleFollowUp(repo, ids, turn),
  };
}

export function suggestFollowUp(input: {
  userId: string;
  assistantId: string;
  skillId: FollowUp['skillId'];
  subject: string;
  now: Date;
  id: string;
}): FollowUp {
  const at = input.now.toISOString();
  return {
    id: input.id,
    userId: input.userId,
    assistantId: input.assistantId,
    skillId: input.skillId,
    origin: 'suggestion',
    subject: input.subject,
    nextStep: 'perguntar só se a pessoa aceitar',
    authorization: 'none',
    status: 'suggested',
    kind: 'suggestion',
    createdAt: at,
    updatedAt: at,
  };
}

export async function handleFollowUp(
  repo: FollowUpRepository,
  ids: IdGenerator,
  turn: SkillTurn,
): Promise<SkillResult | null> {
  const text = normalize(turn.message);
  const open = (await repo.list(turn.userId, turn.assistantId)).filter((item) =>
    OPEN.has(item.status),
  );
  if (text.includes('depois me pergunta')) {
    // Support push authorization and the follow-up must be saved together by
    // the consent handler, rather than creating an unlinked support follow-up.
    if (turn.selection.primary === 'support') return null;
    return remember(repo, ids, turn);
  }
  if (/\b(nao precisa|pode deixar|deixa pra la)\b/.test(text) && !text.includes('me chamar')) {
    return close(repo, open, 'refused', turn.now);
  }
  if (/\b(conclui|pode encerrar|ja resolvi)\b/.test(text))
    return close(repo, open, 'completed', turn.now);
  if (text.includes('semana que vem')) return postpone(repo, open, turn.now);
  return null;
}

async function remember(
  repo: FollowUpRepository,
  ids: IdGenerator,
  turn: SkillTurn,
): Promise<SkillResult> {
  const at = turn.now.toISOString();
  const followUp: FollowUp = {
    id: ids.next(),
    userId: turn.userId,
    assistantId: turn.assistantId,
    skillId: turn.selection.primary,
    origin: 'user_request',
    subject: turn.selection.primary,
    nextStep: 'perguntar de novo sobre o assunto combinado',
    authorization: 'accepted',
    status: 'accepted',
    kind: 'commitment',
    createdAt: at,
    updatedAt: at,
  };
  await repo.put(followUp);
  return {
    skillId: turn.selection.primary,
    facts: [
      {
        id: followUp.id,
        statement: 'Vou perguntar de novo quando fizer sentido. Isso ficou combinado.',
      },
    ],
    calculated: [],
    explanations: ['Um pedido seu vira acompanhamento. Uma sugestão minha, sozinha, não.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'casual', allowSarcasm: true },
  };
}

async function close(
  repo: FollowUpRepository,
  open: FollowUp[],
  status: 'refused' | 'completed',
  now: Date,
): Promise<SkillResult | null> {
  const current = open[0];
  if (!current) return null;
  const updated: FollowUp = {
    ...current,
    status,
    authorization: status === 'refused' ? 'refused' : current.authorization,
    updatedAt: now.toISOString(),
  };
  await repo.put(updated);
  return {
    skillId: current.skillId,
    facts: [
      {
        id: current.id,
        statement:
          status === 'refused' ? 'Beleza, não vou insistir nisso.' : 'Fechei esse acompanhamento.',
      },
    ],
    calculated: [],
    explanations: [],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'measured', allowSarcasm: false },
  };
}

async function postpone(
  repo: FollowUpRepository,
  open: FollowUp[],
  now: Date,
): Promise<SkillResult | null> {
  const current = open.find((item) => item.authorization === 'accepted');
  if (!current) return null;
  const start = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await repo.put({
    ...current,
    status: 'postponed',
    windowStart: start,
    updatedAt: now.toISOString(),
  });
  return {
    skillId: current.skillId,
    facts: [{ id: current.id, statement: 'Deixo para a semana que vem.' }],
    calculated: [],
    explanations: ['Até lá isso não entra na fila de mensagens.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'casual', allowSarcasm: true },
  };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export { canApproach };
