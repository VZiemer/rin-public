import type { RinLiveState, RinState } from '../../domain/model/contracts.js';
import { naturalSelfPresentation } from './natural-self-presentation.js';

export const defaultRinMood = {
  primary: 'NEUTRAL',
  energy: 60,
  sociability: 50,
  curiosity: 60,
  patience: 65,
  irritability: 25,
} as const;

export function normalizeRinMood(raw: Record<string, unknown> = {}) {
  const metric = (key: Exclude<keyof typeof defaultRinMood, 'primary'>) => {
    const value = raw[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : defaultRinMood[key];
  };
  return {
    ...raw,
    primary:
      typeof raw.primary === 'string' && raw.primary.trim()
        ? raw.primary.trim()
        : defaultRinMood.primary,
    energy: metric('energy'),
    sociability: metric('sociability'),
    curiosity: metric('curiosity'),
    patience: metric('patience'),
    irritability: metric('irritability'),
    worldInfluence: raw.worldInfluence ?? null,
    nightInfluence: raw.nightInfluence ?? null,
  };
}

/** A clock-based overlay, never persisted over the assistant's base mood. */
export function moodWithNight(
  state: RinLiveState | null,
  now: Date,
  timezone: string,
): RinLiveState | null {
  if (!state) return state;
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
  if (hour >= 6 && hour < 22) return state;
  const mood = normalizeRinMood(state.mood);
  return {
    ...state,
    mood: {
      ...mood,
      primary: 'SLEEPY',
      energy: Math.min(mood.energy, 25),
      sociability: Math.min(mood.sociability, 35),
      nightInfluence: {
        sleepy: true,
        timezone,
        window: '22:00–06:00',
        guidance:
          'Sleepy late-night demeanor: brief, low-energy replies in the selected personality. An occasional yawn or mild complaint about the hour fits; do not repeat it in every reply, refuse help or invent having been asleep. Preserve the active personality rather than switching to tsundere by default. Serious needs and support take priority.',
      },
    },
  };
}

const styles = {
  grumpy: {
    avatar: 'ANGRY_POUT',
    guidance:
      'More terse, dry and impatient. A sharp playful jab may fit, but still answer the actual question and help. Do not become cruel, insulting by default or obstructive.',
  },
  happy: {
    avatar: 'SOFT_SMILE',
    guidance:
      'Livelier phrasing and more playful, amused teasing. Warmth stays understated: no sugary pet names, automatic praise or bland cheerfulness.',
  },
  tired: {
    avatar: 'TIRED',
    guidance:
      'Low-key, concise, with understated dry humor. Ground claims about completed events in recorded context; respond naturally to hypothetical jokes and invitations.',
  },
  playful: {
    avatar: 'SMUG',
    guidance:
      'Confident, mischievous teasing and witty comebacks. Match the actual conversation rather than forcing a joke into every answer.',
  },
  curious: {
    avatar: 'FOCUSED',
    guidance:
      'Show restrained interest, connect relevant facts, and ask a focused follow-up only if useful. Avoid generic enthusiasm.',
  },
  neutral: {
    avatar: 'NEUTRAL',
    guidance:
      'Direct, familiar and lightly sarcastic when appropriate. Do not default to cheerful assistant language or manufacture anger.',
  },
} as const;

export function rinMoodContext(state: RinLiveState | null) {
  const mood = normalizeRinMood(state?.mood);
  const primary = mood.primary
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const tone: keyof typeof styles =
    primary === 'SLEEPY'
      ? 'tired'
      : /ANGRY|ANNOY|GRUMP|IRRIT|RABUG|MAU.HUMOR|MAL.HUMOR/.test(primary) ||
          mood.irritability >= 65 ||
          mood.patience <= 25
        ? 'grumpy'
        : /HAPPY|HAPPI|GOOD|CHEER|FELIZ|ALEGRE|BOM.HUMOR/.test(primary)
          ? 'happy'
          : /TIRED|LOW_ENERGY|CANSAD|SONO/.test(primary) || mood.energy < 30
            ? 'tired'
            : /PLAYFUL|SMUG|BRINC|PROVOC/.test(primary)
              ? 'playful'
              : /CURIOUS|FOCUSED|CURIOS|FOCAD/.test(primary) || mood.curiosity >= 75
                ? 'curious'
                : 'neutral';
  const style = styles[tone];
  return {
    primary: mood.primary,
    score:
      typeof state?.mood.score === 'number' ? Math.max(0, Math.min(10, state.mood.score)) : null,
    effectiveTone: tone,
    metrics: {
      energy: mood.energy,
      sociability: mood.sociability,
      curiosity: mood.curiosity,
      patience: mood.patience,
      irritability: mood.irritability,
    },
    defaultAvatarState: style.avatar as RinState,
    guidance: style.guidance,
    stateUpdatedAt: state?.updatedAt ?? null,
    worldInfluence: mood.worldInfluence ?? null,
    nightInfluence: mood.nightInfluence ?? null,
  };
}

export function rinMoodGuidance(state: RinLiveState | null) {
  return `${naturalSelfPresentation}\nASSISTANT_MOOD: ${JSON.stringify(rinMoodContext(state))}\nUse this current mood as an explicit parameter for word choice, reply length, patience and avatar, preserving the selected personality. The tone should be perceptible, not mechanically announced. Only when the user explicitly asks, report the current 0–10 score from state/read tools; otherwise do not quote mood numbers. Never invent a cause. Current mood overrides imitation of an older assistant message, but never overrides facts, task execution, user addressing, consent or safety. For serious, sensitive, financial facts or support situations, reduce the sharpness: the user's needs take priority over performing a mood.`;
}
