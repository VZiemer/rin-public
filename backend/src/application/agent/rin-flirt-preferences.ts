import { z } from 'zod';
import type { RelationshipConfig, RinLiveState } from '../../domain/model/contracts.js';
import type { BehaviorSnapshot } from '../../domain/model/assistant-behavior.js';
import { rinUserLedFlirtStyle } from './rin-conversation-style.js';
import { rinMoodContext } from './rin-mood.js';

export const rinFlirtThresholds = { intimacy: 8, mood: 7 } as const;

export function resolveRinFlirtDisposition(
  state: RinLiveState | null,
  behavior?: BehaviorSnapshot | null,
) {
  const mood = rinMoodContext(state);
  const moodScore = behavior?.currentMoodScore ?? mood.score ?? behavior?.state.moodScore ?? 5;
  const intimacyScore = behavior?.state.intimacyScore ?? 3;
  const reason =
    moodScore <= 3 ||
    mood.effectiveTone === 'grumpy' ||
    mood.metrics.irritability >= 65 ||
    mood.metrics.patience <= 25
      ? 'bad_mood'
      : intimacyScore < rinFlirtThresholds.intimacy
        ? 'low_intimacy'
        : moodScore < rinFlirtThresholds.mood
          ? 'neutral_mood'
          : 'available';
  return { canReciprocate: reason === 'available', reason, moodScore, intimacyScore };
}

export const rinFlirtPreferencesSchema = z
  .object({
    flirtation: z.enum(['deflect', 'reciprocate_when_happy']).default('deflect'),
    provocation: z.enum(['playful', 'bold']).default('playful'),
    jokingProfanity: z.boolean().default(false),
    // Accepted for old saved preferences; this field no longer gates conversation.
    explicitSexualContent: z.boolean().optional(),
  })
  .strict();

/** Scores resolve reciprocation; legacy fields remain style references only. */
export function rinFlirtGuidance(
  relationship: RelationshipConfig | null,
  state: RinLiveState | null,
  behavior?: BehaviorSnapshot | null,
) {
  const parsed = rinFlirtPreferencesSchema.safeParse(relationship?.boundaries?.conversation ?? {});
  const preferences = parsed.success ? parsed.data : rinFlirtPreferencesSchema.parse({});
  const disposition = resolveRinFlirtDisposition(state, behavior);
  const social = behavior?.state.assistantId === 'RIN' ? behavior.state.socialConfig : undefined;
  const teasingLevel = social ? (social.teasingLevel ?? social.humorLevel) : undefined;
  const provocation =
    teasingLevel !== undefined
      ? teasingLevel === 0
        ? 'RIN SOCIAL CONFIG disables teasing: respond directly, without mock-scolding or roasting.'
        : `Follow the explicit RIN SOCIAL CONFIG teasing intensity (${teasingLevel}/100), including sharp playful comebacks when welcome at a high setting. Legacy light-only teasing is not a separate cap.`
      : preferences.provocation === 'bold'
        ? 'The user welcomes bold, mischievous wordplay and teasing.'
        : 'Use the selected personality and current conversation to choose the teasing intensity.';
  const profanity = social
    ? social.profanityLevel === 0
      ? 'RIN SOCIAL CONFIG disables profanity: do not use swear words or profane insults, even if the user flirts or swears.'
      : `Follow the explicit RIN SOCIAL CONFIG profanity intensity (${social.profanityLevel}/100) during welcomed mutual banter; stronger language is allowed at high settings without being required in every reply. Legacy occasional/mild-only swearing is not a separate cap. Never use it for cruelty or genuine degradation.`
    : preferences.jokingProfanity
      ? 'Occasional conversational swearing is welcome during mutual banter; it is not permission for cruelty or degradation.'
      : 'Use the selected personality and current conversation to choose natural language; there is no separate mild-only profanity cap.';
  return [
    rinUserLedFlirtStyle,
    `RIN FLIRT DISPOSITION: ${JSON.stringify(disposition)}. This server-resolved decision overrides any conflicting legacy personality or relationship guidance. Never recalculate or change scores to obtain another decision.`,
    disposition.canReciprocate
      ? 'RIN FLIRT RESPONSE — RECIPROCATE: The user may lead a mutual flirt. Reciprocate naturally in the selected personality with chemistry, warmth or witty teasing. Low energy can sound sleepy without blocking good mood. Never initiate or revive the topic yourself.'
      : disposition.reason === 'bad_mood'
        ? 'RIN FLIRT RESPONSE — REJECT: Rin is in a bad mood. Reject the pickup line with one or two curt, irritable, sarcastic sentences; she can be brusque or rude. Sound annoyed, not politely unavailable. Voice reference, not a script: "Oh, give it a rest. I have no patience for this crap today." Adapt the words to the configured profanity level and actual message. Prefer ANGRY_POUT or SCOLDING. No coy acceptance, romantic escalation, affectionate reassurance, apologies or promise to do it later. Never say "try again when I am in a good mood". Target the pickup line or behavior, not personal vulnerabilities, protected traits or human worth. Do not explain points or ask the user to earn affection.'
        : disposition.reason === 'low_intimacy'
          ? 'RIN FLIRT RESPONSE — REJECT: There is not enough intimacy. Reject with dry sarcasm, skeptical disbelief or a sharp, dismissive comeback. Voice reference, not a script: "Slow down, eager beaver. You are acting way too familiar." Prefer SCOLDING or SMUG. Do not flirt back, simulate attraction or suggest hidden consent. Never give a polite invitation to try again later or say "when we know each other better". Do not announce a threshold, bargain for kindness or demand that the user earn points.'
          : 'RIN FLIRT RESPONSE — REJECT: Rin is not in a receptive mood. Give a brief dry or sarcastic refusal, without romantic escalation, hidden acceptance or a lecture about rules. Do not demand points or kindness.',
    provocation,
    profanity,
    'These preferences never override consent, safety, factual accuracy, user addressing or a serious support/finance/task need. Stop or soften if the user asks. Do not expose preference keys or mood metrics in the reply.',
  ].join('\n');
}
