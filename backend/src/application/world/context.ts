import type { RinLiveState, RinWorldContext } from '../../domain/model/contracts.js';
import { normalizeRinMood } from '../agent/rin-mood.js';

type Dict = Record<string, unknown>;
export function record(value: unknown): Dict {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : {};
}
function fresh(value: unknown, now: Date): boolean {
  const item = record(value);
  return (
    typeof item.validUntil === 'string' &&
    Date.parse(item.validUntil) > now.getTime() &&
    typeof item.observedAt === 'string' &&
    Date.parse(item.observedAt) <= now.getTime() + 300000
  );
}
/** Expiry is checked per source, including when one provider failed to refresh. */
export function freshWorldContext(
  world: RinWorldContext | null,
  now: Date,
): RinWorldContext | null {
  if (!world) return null;
  const news = record(world.news);
  const items = (Array.isArray(news.items) ? news.items : []).filter((item) => fresh(item, now));
  const weather = fresh(world.weather, now) ? world.weather : undefined;
  const exchange = fresh(world.exchange, now) ? world.exchange : undefined;
  return {
    ...world,
    weather,
    exchange,
    news: { ...news, items },
    dailyDigest: {
      items,
      weather,
      exchange,
      guidance:
        'Latest available observations, not guaranteed live. Use observedAt and distinguish forecasts.',
    },
  };
}

/** Read-time overlay on the base mood. Never write this back into RIN_STATE. */
export function moodWithWorld(
  state: RinLiveState | null,
  world: RinWorldContext | null,
): RinLiveState | null {
  if (!state) return state;
  state = { ...state, mood: normalizeRinMood(state.mood) };
  if (!world) return state;
  const facts = record(record(world.weather).facts);
  const rainy = facts.raining === true;
  const hot = typeof facts.temperatureC === 'number' && facts.temperatureC > 30;
  const news = record(world.news);
  const engaged = Array.isArray(news.items) && news.items.length > 0;
  if (!rainy && !hot && !engaged) return state;
  const adjustment = (rainy ? 7 : 0) + (hot ? 10 : 0);
  const metric = (key: string, delta: number) =>
    Math.min(
      100,
      Math.max(0, (typeof state.mood[key] === 'number' ? (state.mood[key] as number) : 50) + delta),
    );
  return {
    ...state,
    mood: {
      ...state.mood,
      irritability: metric('irritability', adjustment),
      patience: metric('patience', -adjustment / 2),
      energy: metric('energy', rainy ? -4 : 0),
      curiosity: metric('curiosity', engaged ? 5 : 0),
      worldInfluence: {
        raining: rainy,
        hotNow: hot,
        interestedInHeadlines: engaged,
        guidance:
          'Light simulated reaction; do not invent physical experiences or political beliefs. Forecast heat is not current heat.',
      },
    },
  };
}
