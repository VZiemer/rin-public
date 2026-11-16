import type { AgentOutput, RinState } from '../../domain/model/contracts.js';
import type { SkillResult, SkillToneIntensity } from '../../domain/skills/definition.js';
import type { rinMoodContext } from '../agent/rin-mood.js';

type RinMood = ReturnType<typeof rinMoodContext>;
const moodIntroductions: Record<RinMood['effectiveTone'], string> = {
  neutral: 'Take a look.',
  happy: 'Look at that.',
  grumpy: 'Fine. Pay attention.',
  tired: 'All right, here we go.',
  playful: 'Well, look at that.',
  curious: 'Let us take a closer look.',
};

const HOSTILE =
  /stop being dramatic|stop being weak|you are weak|que frescura|para de drama|n[aã]o [eé] pra tanto|deixa de ser fraco|voc[eê] [eé] fraco|frescura/i;
const CLAIM = /\b(I (?:saved|recorded|transferred|invested|paid your bill)|gravei|registrei|transferi|investi|paguei sua conta)\b/i;
const MONEY = /-?R\$\s?\d[\d.]*,\d{2}|-?\d[\d.]*,\d{2}\s+[A-Z]{3}/g;

export function formatMinor(amountMinor: number, currency: string): string {
  if (!Number.isInteger(amountMinor) || !Number.isSafeInteger(amountMinor)) {
    throw new Error('Amount must be a safe integer in minor units');
  }
  const sign = amountMinor < 0 ? '-' : '';
  const absolute = Math.abs(amountMinor);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  if (currency === 'BRL') return `${sign}R$ ${whole},${fraction}`;
  return `${sign}${whole},${fraction} ${currency}`;
}

export function renderSkillMessage(result: SkillResult, mood?: RinMood): string {
  const parts: string[] = [];
  if (result.tone.allowSarcasm && result.tone.intensity === 'casual')
    parts.push((mood ? moodIntroductions[mood.effectiveTone] : undefined) ?? 'Take a look.');
  if (!result.tone.allowSarcasm) parts.push('I am here.');
  for (const fact of result.facts) parts.push(fact.statement);
  for (const value of result.calculated) {
    parts.push(`${value.label}: ${formatMinor(value.amountMinor, value.currency)}.`);
  }
  for (const explanation of result.explanations) parts.push(explanation);
  if (result.missing.length > 0) {
    parts.push(`I need ${result.missing.join(', ')}. I will not invent this data.`);
  }
  for (const action of result.proposedActions) parts.push(action.label);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function messagePreservesFacts(message: string, result: SkillResult): boolean {
  if (!result.tone.allowSarcasm && HOSTILE.test(normalize(message))) return false;
  const expected = result.calculated.map((value) => formatMinor(value.amountMinor, value.currency));
  if (expected.some((formatted) => !message.includes(formatted))) return false;
  const mentioned = message.match(MONEY) ?? [];
  const allowed = new Set(expected);
  if (mentioned.some((token) => !allowed.has(token.replace(/\s+/g, ' ').trim()))) return false;
  const facts = result.facts.map((fact) => fact.statement).join(' ');
  if (CLAIM.test(message) && !CLAIM.test(facts)) return false;
  return true;
}

export function presentSkill(result: SkillResult, draft?: string, mood?: RinMood): AgentOutput {
  const message = (draft ?? renderSkillMessage(result, mood)).trim();
  if (!message || !messagePreservesFacts(message, result)) return fallbackSkillOutput(result);
  return {
    message,
    avatarState:
      mood && result.tone.allowSarcasm && result.tone.intensity === 'casual'
        ? mood.defaultAvatarState
        : avatarFor(result.tone.intensity, result.tone.allowSarcasm),
    priority: result.tone.intensity === 'serious' ? 'HIGH' : 'NORMAL',
    actions: [],
  };
}

export function fallbackSkillOutput(result: SkillResult): AgentOutput {
  const values = result.calculated
    .map((value) => `${value.label}: ${formatMinor(value.amountMinor, value.currency)}.`)
    .join(' ');
  const message = values
    ? `I will stick to what can be verified. ${values}`
    : 'I could not validate the response, so I will not assert amounts or claim I saved anything.';
  return {
    message,
    avatarState: 'FOCUSED',
    priority: 'NORMAL',
    actions: [],
  };
}

function avatarFor(intensity: SkillToneIntensity, allowSarcasm: boolean): RinState {
  if (!allowSarcasm || intensity === 'gentle' || intensity === 'serious') return 'SOFT_SMILE';
  if (intensity === 'measured') return 'FOCUSED';
  return 'SMUG';
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
