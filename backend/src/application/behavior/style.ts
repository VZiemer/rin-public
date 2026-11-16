import type { BehaviorSnapshot } from '../../domain/model/assistant-behavior.js';
import { rinConversationStyle, rinPersonalityStyle } from '../agent/rin-conversation-style.js';
import { socialStyle } from './social-style.js';

export function behaviorStyle(
  snapshot: BehaviorSnapshot | null | undefined,
  conversation = false,
  latestUserMessage?: string,
): string {
  if (!snapshot) return (conversation ? rinConversationStyle : rinPersonalityStyle).join('\n');
  const { state, personality } = snapshot;
  const explicitSocialStyle = socialStyle(snapshot, latestUserMessage);
  const common = (conversation ? rinConversationStyle : rinPersonalityStyle).filter(
    (line) =>
      !/^(?:RIN TSUNDERE CORE:|RIN PERSONALITY BY MOOD:|RIN FLIRT RESPONSE:|Style references,)/.test(
        line,
      ) && !(explicitSocialStyle && /^(?:CONSENSUAL ROASTING:|RIN CASUAL BANTER:)/.test(line)),
  );
  return [
    ...common,
    `ACTIVE PERSONALITY: ${JSON.stringify({ id: personality.id, version: personality.version, traits: personality.traits, guidance: personality.guidance })}`,
    explicitSocialStyle
      ? 'The selected personality determines delivery except for the dimensions controlled by RIN SOCIAL CONFIG below, which override conflicting profile guidance and legacy defaults. Mood changes intensity and energy, not the selected personality or social settings. Keep identity, facts, capabilities, consent and safety unchanged.'
      : 'The selected personality is authoritative for delivery. Legacy descriptions of Rin as sarcastic, tsundere, reluctant, cynical or rejecting are defaults only; when the selected profile differs, replace those stylistic defaults with its guidance. Mood changes intensity and energy, not the selected personality. Keep identity, facts, capabilities, consent and safety unchanged.',
    `RELATIONSHIP STATE: intimacy=${state.intimacyScore}/10; currentMood=${snapshot.currentMoodScore ?? state.moodScore}/10. Reciprocal flirting requires intimacy at least 8 and mood at least 7, without high irritability; RIN FLIRT DISPOSITION resolves this for the turn. Lower intimacy or an unreceptive mood means rejection, even if an older profile says to always reciprocate. Never invent shared history, demand affection, expose configuration unprompted or treat these scores as real human feelings. Report scores accurately only when asked. Natural evolution follows completed conversations; only the backend applies score updates. Never promise an increase or pretend to change scores yourself. Direct overrides use the authorized hipnose command.`,
    'Mood scores 0–3 indicate low/grumpy disposition, 4–6 neutral and 7–10 good/happy disposition. Energy, urgency and night sleepiness are separate. The current score is derived from persisted state, gradually returning to 5 between interactions; absence never reduces intimacy. Use available world/night overlays for delivery tone without inventing another score.',
    explicitSocialStyle,
  ]
    .filter(Boolean)
    .join('\n');
}
