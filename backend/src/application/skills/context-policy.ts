import { AppError } from '../../domain/errors/app-error.js';
import type { SkillId } from '../../domain/skills/definition.js';
import type { WorkingMemoryTurn } from '../../domain/model/contracts.js';
import {
  emotionalPermanentAllowed,
  type ContextProjection,
  type DomainRecord,
  type SkillDomain,
} from '../../domain/skills/domain-record.js';

const EMOTIONAL = /desperate|anxious|anxiety|\bsad\b|\bvent(?:ed|ing)?\b|crying|distress|panic|desesper|ansied|triste|desabaf|chorand|angusti|panico|nao aguento/i;
const MONEY = /(?:r\$|\$|USD|BRL|EUR)\s?\d[\d.,]*|\d+(?:[.,]\d+)?\s?(?:reais|dollars|euros)|\b\d+[.,]\d{2}\b/gi;

export function prepareDomainRecord(record: DomainRecord): DomainRecord {
  if (!emotionalPermanentAllowed(record)) throw new AppError('consent_required', 409);
  return record;
}

export function projectSkillContext(input: {
  skillId: SkillId;
  userId: string;
  assistantId: string;
  records: readonly DomainRecord[];
  workingSummary: string | null;
  now: Date;
}): ContextProjection {
  const owned = input.records.filter(
    (record) =>
      record.userId === input.userId &&
      record.assistantId === input.assistantId &&
      !expired(record, input.now),
  );
  if (input.skillId === 'finance') {
    return {
      skillId: 'finance',
      records: owned.filter((record) => record.sensitivity !== 'emotional'),
      workingSummary: minimizeFinanceSummary(input.workingSummary),
      omitted: owned.some((record) => record.sensitivity === 'emotional') ? ['emotional'] : [],
    };
  }
  if (input.skillId === 'support') {
    return {
      skillId: 'support',
      records: owned.filter((record) => record.sensitivity !== 'financial').map((record) => record),
      workingSummary: input.workingSummary ? redactMoney(input.workingSummary) : null,
      omitted: owned.some((record) => record.sensitivity === 'financial') ? ['financial'] : [],
    };
  }
  if (input.skillId === 'flirt') {
    const summary = input.workingSummary;
    const sensitive =
      summary &&
      (EMOTIONAL.test(summary) ||
        /r\$|\breais\b|budget|salary|invoice|debt|therapy|psycholog|or[cç]amento|sal[aá]rio|fatura|boleto|terapia|psic[oó]log/i.test(summary));
    return {
      skillId: 'flirt',
      records: [],
      workingSummary: sensitive ? null : summary,
      omitted: [
        ...new Set(
          owned
            .map((record) => record.sensitivity)
            .filter(
              (sensitivity): sensitivity is 'emotional' | 'financial' =>
                sensitivity !== 'operational',
            ),
        ),
      ],
    };
  }
  return {
    skillId: 'conversation',
    records: owned.filter((record) => record.sensitivity === 'operational'),
    workingSummary: input.workingSummary,
    omitted: [],
  };
}

export function visibleDomains(skillId: SkillId): readonly SkillDomain[] {
  if (skillId === 'finance') return ['finance'];
  if (skillId === 'support') return ['support'];
  return [];
}

/** Apply the same per-skill minimization to exact recent exchanges as to legacy summaries. */
export function projectRecentTurns(input: {
  skillId: SkillId;
  userId: string;
  assistantId: string;
  turns: readonly WorkingMemoryTurn[];
  now: Date;
}): WorkingMemoryTurn[] {
  return input.turns.slice(-4).flatMap((turn) => {
    const project = (text: string) =>
      projectSkillContext({
        skillId: input.skillId,
        userId: input.userId,
        assistantId: input.assistantId,
        records: [],
        workingSummary: text,
        now: input.now,
      }).workingSummary;
    const message = project(turn.message);
    const reply = project(turn.reply);
    return message !== null && reply !== null ? [{ ...turn, message, reply }] : [];
  });
}

function minimizeFinanceSummary(summary: string | null): string | null {
  if (!summary) return null;
  if (EMOTIONAL.test(summary)) {
    return 'Conversation continuity preserved. Emotional details stay outside this module.';
  }
  return redactMoney(summary) === summary ? summary : redactMoney(summary);
}

function redactMoney(text: string): string {
  return text.replace(MONEY, '[amount]');
}

function expired(record: DomainRecord, now: Date): boolean {
  return record.expiresAt !== undefined && Date.parse(record.expiresAt) <= now.getTime();
}
