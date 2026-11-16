import { AppError } from '../../domain/errors/app-error.js';
import { defaultSkillPolicy, type SkillPolicy } from '../../domain/skills/definition.js';

/**
 * The agent loop already stops at 12s and at most six model calls.
 * Skill selection, context projection and result checks run in-process,
 * so they do not add another model round-trip and the 12s cap stays.
 */
export function assertSkillBudget(
  usage: { elapsedMs: number; modelCalls: number; tokens?: number | undefined },
  policy: SkillPolicy = defaultSkillPolicy,
): void {
  if (usage.elapsedMs > policy.deadlineMs) throw new AppError('agent_deadline_exceeded', 504);
  if (usage.modelCalls > policy.maxModelCalls) throw new AppError('skill_budget_exceeded', 504);
  if (usage.tokens !== undefined && usage.tokens > policy.maxTokens) {
    throw new AppError('skill_budget_exceeded', 504);
  }
}
