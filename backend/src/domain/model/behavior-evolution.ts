import { z } from 'zod';
import { assistantIdSchema } from './assistant-id.js';
import type { AssistantBehavior } from './assistant-behavior.js';

export const interactionEventSchema = z
  .object({
    userId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    assistantId: assistantIdSchema,
    eventId: z.string().regex(/^[A-Za-z0-9_=.-]{1,128}$/),
    conversationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    occurredAt: z.iso.datetime(),
    timezone: z
      .string()
      .min(1)
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
    skill: z.enum(['conversation', 'flirt']),
    message: z.string().min(1).max(8000),
    reply: z.string().max(1600),
    playfulBanterAllowed: z.boolean(),
  })
  .strict();
export type InteractionEvent = z.infer<typeof interactionEventSchema>;
export const interactionAssessmentSchema = z
  .object({
    signal: z.enum(['friendly', 'offensive', 'neutral']),
    confidence: z.number().finite().min(0).max(1),
    reason: z.enum([
      'friendly_exchange',
      'direct_hostility',
      'ordinary_request',
      'criticism',
      'boundary',
      'support',
      'quoted',
      'playful_banter',
      'uncertain',
    ]),
  })
  .strict();
export type InteractionAssessment = z.infer<typeof interactionAssessmentSchema>;

export function moodScoreAt(state: AssistantBehavior, now: Date): number {
  const anchor = Date.parse(state.moodAnchorAt ?? state.updatedAt);
  const hours = Math.max(0, Math.floor((now.getTime() - anchor) / 3600000));
  const difference = 5 - state.moodScore;
  const movement = Math.min(Math.abs(difference), hours * 0.1);
  return Math.round((state.moodScore + Math.sign(difference) * movement) * 100) / 100;
}

/** Conservative exclusion: errors, criticism, boundaries, distress and operational requests are not social penalties. */
export function protectedInteraction(message: string): boolean {
  const text = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return (
    /\b(seu humor|noss[ao] (?:amizade|intimidade)|sua personalidade)\b/.test(text) ||
    /["“”]|```|(?:^|\n)\s*>/.test(message) ||
    /\b(hipnose|hipinose|hipnotiz\w*|pontuacao|nota de humor|nota de intimidade|aument[ae] (?:seu |nosso |o )?(?:humor|vinculo|intimidade))\b/.test(
      text,
    ) ||
    /\b(nao quero|nao gostei|nao gosto|nao concordo|discordo|pare|para com|chega|respeite|limite|nao me chame|nao me chama)\b/.test(
      text,
    ) ||
    /\b(bug|erro|errad\w*|falhou|problema|nao funciona|nao funcionou|nao recebi|travou|timezone|fuso|corri[gj]\w*)\b/.test(
      text,
    ) ||
    /\b(crise|psicolog\w*|terapia|ansied\w*|depress\w*|suicid\w*|me matar|me machucar|quero morrer|estou mal|to mal|triste|medo|luto)\b/.test(
      text,
    ) ||
    /\b(lembrete|lembrar|lembre|me avise|me avisa|tarefa|alarme|paguei|boleto|fatura|orcamento|gastei|comprar|lista de compras)\b/.test(
      text,
    )
  );
}

export interface EvolutionDecision {
  reason: string;
  moodDelta: number;
  intimacyDelta: number;
  state: AssistantBehavior | null;
}
const round = (value: number) => Math.round(value * 100) / 100;

export const rinEvolutionPolicy = {
  friendlyConfidence: 0.75,
  offensiveConfidence: 0.9,
  moodGain: 0.2,
  moodLoss: 0.5,
  intimacyGain: 0.1,
  intimacyLoss: 0.2,
  dailyMoodGain: 2,
  dailyMoodLoss: 3,
  dailyIntimacyGain: 0.5,
  dailyIntimacyLoss: 1,
  moodCooldownMs: 0,
  intimacyCooldownMs: 0,
} as const;

const legacyEvolutionPolicy = {
  friendlyConfidence: 0.85,
  offensiveConfidence: 0.95,
  moodGain: 0.2,
  moodLoss: 0.3,
  intimacyGain: 0.1,
  intimacyLoss: 0.2,
  dailyMoodGain: 1,
  dailyMoodLoss: 1.5,
  dailyIntimacyGain: 0.5,
  dailyIntimacyLoss: 1,
  moodCooldownMs: 5 * 60000,
  intimacyCooldownMs: 10 * 60000,
} as const;

export function evolveBehavior(
  state: AssistantBehavior,
  event: InteractionEvent,
  assessment: InteractionAssessment,
  now: Date,
  day: string,
): EvolutionDecision {
  const unchanged = (reason: string): EvolutionDecision => ({
    reason,
    moodDelta: 0,
    intimacyDelta: 0,
    state: null,
  });
  const eventTime = Date.parse(event.occurredAt);
  const age = now.getTime() - eventTime;
  if (!state.evolutionEnabled) return unchanged('disabled');
  if (age < -300000 || age > 3600000) return unchanged('expired');
  if (state.lastManualChangeAt && eventTime <= Date.parse(state.lastManualChangeAt))
    return unchanged('manual_override');
  if (state.dynamics?.lastEventAt && eventTime <= Date.parse(state.dynamics.lastEventAt))
    return unchanged('out_of_order');
  if (protectedInteraction(event.message)) return unchanged('protected');
  if (assessment.signal === 'neutral') return unchanged(assessment.reason);
  const positive = assessment.signal === 'friendly';
  const policy = event.assistantId === 'RIN' ? rinEvolutionPolicy : legacyEvolutionPolicy;
  if (assessment.confidence < (positive ? policy.friendlyConfidence : policy.offensiveConfidence))
    return unchanged('low_confidence');
  if (assessment.reason !== (positive ? 'friendly_exchange' : 'direct_hostility'))
    return unchanged('inconsistent_assessment');
  if (
    !positive &&
    /\b(kk+k*|haha+|rs+|brincadeir\w*|zoeir\w*|brincando)\b/.test(event.message.toLowerCase())
  )
    return unchanged('playful_banter');
  const previous = state.dynamics;
  const counters =
    previous?.day === day
      ? previous
      : { day, moodGain: 0, moodLoss: 0, intimacyGain: 0, intimacyLoss: 0 };
  const moodReady =
    !previous?.lastMoodAt || eventTime - Date.parse(previous.lastMoodAt) >= policy.moodCooldownMs;
  const intimacyReady =
    !previous?.lastIntimacyAt ||
    eventTime - Date.parse(previous.lastIntimacyAt) >= policy.intimacyCooldownMs;
  const moodBudget = Math.max(
    0,
    positive ? policy.dailyMoodGain - counters.moodGain : policy.dailyMoodLoss - counters.moodLoss,
  );
  const intimacyBudget = Math.max(
    0,
    positive
      ? policy.dailyIntimacyGain - counters.intimacyGain
      : policy.dailyIntimacyLoss - counters.intimacyLoss,
  );
  const moodBefore = moodScoreAt(state, now);
  const moodStep = moodReady
    ? Math.min(positive ? policy.moodGain : policy.moodLoss, moodBudget)
    : 0;
  const intimacyStep = intimacyReady
    ? Math.min(positive ? policy.intimacyGain : policy.intimacyLoss, intimacyBudget)
    : 0;
  const moodAfter = round(
    Math.max(0, Math.min(10, moodBefore + (positive ? moodStep : -moodStep))),
  );
  const intimacyAfter = round(
    Math.max(0, Math.min(10, state.intimacyScore + (positive ? intimacyStep : -intimacyStep))),
  );
  const moodDelta = round(moodAfter - moodBefore),
    intimacyDelta = round(intimacyAfter - state.intimacyScore);
  if (!moodDelta && !intimacyDelta)
    return unchanged(
      event.assistantId === 'RIN' ? 'daily_limit_or_score_bounds' : 'cooldown_or_daily_limit',
    );
  const dynamics: NonNullable<AssistantBehavior['dynamics']> = {
    ...counters,
    ...(previous?.lastMoodAt ? { lastMoodAt: previous.lastMoodAt } : {}),
    ...(previous?.lastIntimacyAt ? { lastIntimacyAt: previous.lastIntimacyAt } : {}),
    lastEventAt: event.occurredAt,
    moodGain: round(counters.moodGain + Math.max(0, moodDelta)),
    moodLoss: round(counters.moodLoss + Math.max(0, -moodDelta)),
    intimacyGain: round(counters.intimacyGain + Math.max(0, intimacyDelta)),
    intimacyLoss: round(counters.intimacyLoss + Math.max(0, -intimacyDelta)),
    ...(moodDelta ? { lastMoodAt: event.occurredAt } : {}),
    ...(intimacyDelta ? { lastIntimacyAt: event.occurredAt } : {}),
  };
  return {
    reason: positive ? 'friendly_exchange' : 'direct_hostility',
    moodDelta,
    intimacyDelta,
    state: {
      ...state,
      moodScore: moodDelta ? moodAfter : state.moodScore,
      intimacyScore: intimacyAfter,
      moodAnchorAt: moodDelta ? now.toISOString() : (state.moodAnchorAt ?? state.updatedAt),
      dynamics,
      version: state.version + 1,
      updatedAt: now.toISOString(),
    },
  };
}
