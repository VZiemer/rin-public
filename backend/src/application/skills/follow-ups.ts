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
    nextStep: 'ask only if the person agrees',
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
  if (text.includes('depois me pergunta') || /^ask me later(?: about .+)?$/.test(text)) {
    // Support push authorization and the follow-up must be saved together by
    // the consent handler, rather than creating an unlinked support follow-up.
    if (turn.selection.primary === 'support') return null;
    return remember(repo, ids, turn);
  }
  if (/\b(no need|never mind|nao precisa|pode deixar|deixa pra la)\b/.test(text) && !text.includes('me chamar')) {
    return close(repo, open, 'refused', turn.now);
  }
  if (/\b(i finished|close this follow-up|already resolved|conclui|pode encerrar|ja resolvi)\b/.test(text))
    return close(repo, open, 'completed', turn.now);
  if (text.includes('semana que vem') || text === 'next week') return postpone(repo, open, turn.now);
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
    nextStep: 'ask again about the agreed subject',
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
        statement: 'I will ask again when it makes sense, as agreed.',
      },
    ],
    calculated: [],
    explanations: ['Your request creates a follow-up. My suggestion alone does not.'],
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
          status === 'refused' ? 'All right, I will not insist on this.' : 'I closed this follow-up.',
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
    facts: [{ id: current.id, statement: 'I will leave it until next week.' }],
    calculated: [],
    explanations: ['Until then, this will not enter the message queue.'],
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
