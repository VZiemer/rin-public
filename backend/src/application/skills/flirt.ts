import type { RelationshipConfig, RinLiveState } from '../../domain/model/contracts.js';
import { rinFlirtGuidance } from '../agent/rin-flirt-preferences.js';
import type { BehaviorSnapshot } from '../../domain/model/assistant-behavior.js';

/** Routing only: it does not infer consent or request a different safety policy/model. */
export function isFlirtIntent(text: string): boolean {
  return (
    /\b(flert\w*|cantad\w*|duplo sentido|me provoca|me beija|me da um beijo|namora comigo|namoraria comigo|casa comigo|casaria comigo|me daria uma chance)\b/.test(
      text,
    ) ||
    /\b(voce|vc|rin)\b.{0,30}\b(linda|gata|gostosa|sexy)\b/.test(text) ||
    /\bsua (linda|gata|gostosa)\b/.test(text) ||
    /^(?:o+[\s,]*|e ai[\s,]*)?(?:rin|voce|vc)[\s,!]*(?:(?:voce|vc)[\s,]*)?(?:quer|queria|vamos|bora|topa)\s+transar\b/.test(
      text,
    ) ||
    (/\b(baby\s?doll|lingerie|camisola)\b/.test(text) && /\b(voce|vc|rin|sua roupa)\b/.test(text))
  );
}

export function endsFlirt(text: string): boolean {
  return /\b(para|pare|chega|sem|nao quero)\b.{0,35}\b(flert\w*|cantad\w*|provoc\w*|brincadeira)\b/.test(
    text,
  );
}

export function continuesFlirt(text: string): boolean {
  return /^(?:e\s+)?(?:serio|e mesmo|mesmo|duvido|quero ver|continua|continue|me conta mais|gostei|talvez|h+m+|haha+|rs+)[!?.\s]*$/.test(
    text,
  );
}

export function flirtSkillGuidance(
  relationship: RelationshipConfig | null,
  state: RinLiveState | null,
  behavior?: BehaviorSnapshot | null,
) {
  return [
    "FLIRT SKILL: Handle the user's current pickup line, compliment or invitation to playful banter. Answer naturally as Rin in pt-BR, normally one or two short sentences. The skill specializes tone; it never removes boundaries or changes permissions.",
    rinFlirtGuidance(relationship, state, behavior),
    'Use creative wit appropriate to RIN FLIRT DISPOSITION: chemistry when available, curt or sarcastic rejection when unavailable. Respond to the actual message rather than reciting rules or explaining this skill. Do not invent memories, physical encounters or experiences. Do not force flirting into an unrelated topic.',
    'If assistantAppearance is present, you may acknowledge the actual catalog outfit and expression. Never claim to generate, send, download or select another image; only the backend selects registered assets.',
    'Only get_mood and get_relationship_state reads are available for explicit questions about your state. No operational writes or Android actions are available. Use NORMAL priority and actions=[]. Do not create follow-ups, financial entries, tasks or reminders, or claim a change was saved. If the user asks to stop, stop immediately. Serious support, money and operational requests belong in their own modules.',
  ].join('\n');
}
