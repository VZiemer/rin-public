import type { RandomGenerator } from '../ports/runtime.js';
import type { RinState } from '../../domain/model/contracts.js';
import { insideQuietHours, type LocalClock } from '../agent/clock-zone.js';

export interface ProactiveConfig {
  timezone: string;
  minCooldownMinutes: number;
  maxMessagesPerDay: number;
  baseChance: number;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface NormalizedInitiative {
  proactiveEnabled: boolean;
  baseChance: number;
  minCooldownMinutes: number;
  maxMessagesPerDay: number;
  messagesSentToday: number;
  messagesSentDate: string;
  lastProactiveAt: string | null;
  lastTopics: string[];
  allowRecommendations: boolean;
  allowCasualTangents: boolean;
  allowPersonalOpinions: boolean;
  allowMoodComments: boolean;
  quietHours: { start: string; end: string };
}

export interface Opportunity {
  type: string;
  topic: string;
  weight: number;
  id: string;
  data: Record<string, unknown>;
}
export interface ScoreFactor {
  factor: string;
  delta: number;
}
export interface ScoreInfo {
  score: number;
  factors: ScoreFactor[];
}
export interface GatingResult {
  allowed: boolean;
  reason: string;
}

type Dict = Record<string, unknown>;

export function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
export function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeInitiative(
  raw: Dict = {},
  today: string,
  config: ProactiveConfig,
): NormalizedInitiative {
  const sameDay = raw.messagesSentDate === today;
  const quietHours = (raw.quietHours ?? {}) as Dict;
  return {
    proactiveEnabled: raw.proactiveEnabled !== false,
    baseChance: clampNumber(raw.baseChance, config.baseChance, 0, 0.85),
    minCooldownMinutes: clampNumber(raw.minCooldownMinutes, config.minCooldownMinutes, 15, 1440),
    maxMessagesPerDay: Math.trunc(
      clampNumber(raw.maxMessagesPerDay, config.maxMessagesPerDay, 1, 20),
    ),
    messagesSentToday: sameDay ? Math.max(0, Number(raw.messagesSentToday) || 0) : 0,
    messagesSentDate: today,
    lastProactiveAt: (raw.lastProactiveAt as string | undefined) ?? null,
    lastTopics: Array.isArray(raw.lastTopics) ? (raw.lastTopics as string[]).slice(-8) : [],
    allowRecommendations: raw.allowRecommendations !== false,
    allowCasualTangents: raw.allowCasualTangents !== false,
    allowPersonalOpinions: raw.allowPersonalOpinions !== false,
    allowMoodComments: raw.allowMoodComments !== false,
    quietHours: {
      start: (quietHours.start as string | undefined) || config.quietHoursStart,
      end: (quietHours.end as string | undefined) || config.quietHoursEnd,
    },
  };
}

export function canAttempt(params: {
  now: Date;
  local: LocalClock;
  initiative: NormalizedInitiative;
  force: boolean;
}): GatingResult {
  const { now, local, initiative, force } = params;
  if (force) return { allowed: true, reason: 'forced' };
  if (!initiative.proactiveEnabled) return { allowed: false, reason: 'proactive_disabled' };
  if (initiative.messagesSentToday >= initiative.maxMessagesPerDay)
    return { allowed: false, reason: 'daily_limit' };
  if (insideQuietHours(local.time, initiative.quietHours.start, initiative.quietHours.end))
    return { allowed: false, reason: 'quiet_hours' };
  if (initiative.lastProactiveAt) {
    const elapsedMinutes = (now.getTime() - Date.parse(initiative.lastProactiveAt)) / 60000;
    if (Number.isFinite(elapsedMinutes) && elapsedMinutes < initiative.minCooldownMinutes)
      return { allowed: false, reason: 'cooldown' };
  }
  return { allowed: true, reason: 'eligible' };
}

export function normalizeNewsItems(world: Dict): Dict[] {
  const news = world.news as Dict | Dict[] | undefined;
  if (news && !Array.isArray(news) && Array.isArray((news as Dict).items))
    return (news as Dict).items as Dict[];
  const digest = world.dailyDigest as Dict | undefined;
  if (digest && Array.isArray(digest.items)) return digest.items as Dict[];
  if (Array.isArray(news)) return news;
  return [];
}

export function hasRecentWeatherChange(weather: Dict | undefined): boolean {
  if (!weather) return false;
  if (weather.changed === true || weather.significantChange === true) return true;
  const facts = (weather.facts ?? {}) as Dict;
  return Boolean(
    (facts.previousCondition && facts.condition && facts.previousCondition !== facts.condition) ||
      (Number.isFinite(facts.temperatureChangeC) &&
        Math.abs(Number(facts.temperatureChangeC)) >= 4),
  );
}

export function inferTopic(value: unknown): string {
  const text = String(value).toLowerCase();
  if (/mang[aá]|seinen|junji|chainsaw|dorohedoro/.test(text)) return 'manga';
  if (/cosplay|fantasia|costume/.test(text)) return 'cosplay';
  if (/anime/.test(text)) return 'anime';
  if (/clima|chuva|sol|tempo|frio|calor/.test(text)) return 'weather';
  if (/c[oó]digo|aws|lambda|software|tecnologia/.test(text)) return 'technology';
  return 'casual';
}

export function chooseOpportunity(params: {
  state: Dict;
  preferences: Dict;
  world: Dict;
  requestedTopic?: string | null;
  random: RandomGenerator;
}): Opportunity {
  const { state, preferences, world, requestedTopic, random } = params;
  const opportunities: Opportunity[] = [];

  for (const item of normalizeNewsItems(world)) {
    if (item.mentionedToUserAt) continue;
    const interest = clampNumber(item.rinInterest ?? item.interest ?? item.importance, 0.55, 0, 1);
    opportunities.push({
      type: 'NEWS',
      topic: cleanString(item.category ?? item.topic) ?? 'news',
      weight: 0.5 + interest * 0.45,
      id: String(item.id ?? item.url ?? item.headline ?? 'news'),
      data: {
        headline: item.headline ?? item.title ?? null,
        summary: item.summary ?? item.description ?? null,
        category: item.category ?? item.topic ?? null,
        facts: item.facts ?? null,
        source: item.source ?? null,
        sources: item.sources ?? null,
        observedAt: item.observedAt ?? world.capturedAt ?? null,
      },
    });
  }

  const weather = world.weather as Dict | undefined;
  if (weather && weather.status !== 'NOT_LOADED' && weather.facts) {
    opportunities.push({
      type: 'WEATHER',
      topic: 'weather',
      weight: hasRecentWeatherChange(weather) ? 0.76 : 0.42,
      id: String(weather.observedAt ?? world.capturedAt ?? 'weather'),
      data: {
        facts: weather.facts,
        interpretation: weather.rinInterpretation ?? null,
        observedAt: weather.observedAt ?? world.capturedAt ?? null,
        validUntil: world.validUntil ?? null,
      },
    });
  }

  if (Array.isArray(state.currentThoughts)) {
    for (const thought of (state.currentThoughts as unknown[]).slice(0, 8)) {
      if (!cleanString(thought)) continue;
      opportunities.push({
        type: 'CASUAL_THOUGHT',
        topic: inferTopic(thought),
        weight: 0.44,
        id: `thought:${String(thought).slice(0, 80)}`,
        data: { thought },
      });
    }
  }

  if (Array.isArray(state.currentInterests)) {
    for (const interest of (state.currentInterests as unknown[]).slice(0, 8)) {
      if (!cleanString(interest)) continue;
      opportunities.push({
        type: 'CURRENT_INTEREST',
        topic: inferTopic(interest),
        weight: 0.39,
        id: `interest:${String(interest).slice(0, 80)}`,
        data: { interest },
      });
    }
  }

  const recommendationTopics = Array.isArray(preferences.recommendationTopics)
    ? (preferences.recommendationTopics as unknown[])
    : [];
  for (const topic of recommendationTopics.slice(0, 8)) {
    opportunities.push({
      type: 'RECOMMENDATION_THOUGHT',
      topic: String(topic),
      weight: 0.34,
      id: `recommend:${String(topic)}`,
      data: { topic },
    });
  }

  if (opportunities.length === 0) {
    opportunities.push({
      type: 'CASUAL_THOUGHT',
      topic: 'casual',
      weight: 0.25,
      id: 'casual',
      data: { thought: 'Rin simply feels like saying something to her long-time friend.' },
    });
  }

  const initiative = (state.initiative ?? {}) as Dict;
  const lastTopics = Array.isArray(initiative.lastTopics) ? (initiative.lastTopics as string[]) : [];
  for (const opp of opportunities) {
    if (lastTopics.includes(opp.topic)) opp.weight -= 0.18;
    if (requestedTopic && opp.topic.toLowerCase().includes(requestedTopic.toLowerCase()))
      opp.weight += 1.0;
  }

  opportunities.sort((a, b) => b.weight - a.weight);
  const top = opportunities.slice(0, 5);
  const total = top.reduce((sum, item) => sum + Math.max(0.05, item.weight), 0);
  let cursor = random.next() * total;
  for (const item of top) {
    cursor -= Math.max(0.05, item.weight);
    if (cursor <= 0) return item;
  }
  return top[0]!;
}

export function calculateScore(params: {
  state: Dict;
  world: Dict;
  opportunity: Opportunity;
  initiative: NormalizedInitiative;
  lastConversationAt: string | null;
  now: Date;
}): ScoreInfo {
  const { state, world, opportunity, initiative, lastConversationAt, now } = params;
  const mood = (state.mood ?? {}) as Dict;
  let score = initiative.baseChance;
  const factors: ScoreFactor[] = [{ factor: 'base', delta: initiative.baseChance }];

  const addFactor = (factor: string, delta: number) => {
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.001) return;
    score += delta;
    factors.push({ factor, delta: round(delta, 4) });
  };

  addFactor('sociability', ((num(mood.sociability, 50) - 50) / 50) * 0.09);
  addFactor('curiosity', ((num(mood.curiosity, 50) - 50) / 50) * 0.06);
  addFactor('energy', ((num(mood.energy, 50) - 50) / 50) * 0.05);
  addFactor('low_patience', -Math.max(0, (35 - num(mood.patience, 50)) / 35) * 0.05);
  addFactor('high_irritability', -Math.max(0, (num(mood.irritability, 50) - 65) / 35) * 0.1);

  const primaryMood = String(mood.primary ?? '').toUpperCase();
  const casualInitiative = ['CASUAL_THOUGHT', 'CURRENT_INTEREST', 'RECOMMENDATION_THOUGHT'].includes(
    opportunity.type,
  );
  if (primaryMood.includes('ANGRY') && casualInitiative) addFactor('angry_not_social', -0.35);
  else if ((primaryMood.includes('ANNOYED') || primaryMood.includes('GRUMPY')) && casualInitiative)
    addFactor('grumpy_less_social', -0.08);

  if (opportunity.type === 'NEWS')
    addFactor('interesting_news', Math.min(0.28, 0.08 + opportunity.weight * 0.16));
  if (opportunity.type === 'WEATHER')
    addFactor('weather', hasRecentWeatherChange(world.weather as Dict | undefined) ? 0.12 : 0.03);
  if (opportunity.type === 'CASUAL_THOUGHT') addFactor('casual_thought', 0.02);
  if (opportunity.type === 'CURRENT_INTEREST') addFactor('current_interest', 0.04);
  if (opportunity.type === 'RECOMMENDATION_THOUGHT') addFactor('recommendation', 0.03);

  if (lastConversationAt) {
    const hours = (now.getTime() - Date.parse(lastConversationAt)) / 3_600_000;
    if (Number.isFinite(hours)) {
      if (hours >= 12) addFactor('user_quiet_12h', 0.1);
      else if (hours >= 6) addFactor('user_quiet_6h', 0.06);
      else if (hours < 1) addFactor('recent_conversation', -0.05);
    }
  }

  score = Math.max(0.01, Math.min(0.72, score));
  return { score: round(score, 4), factors };
}

export function avatarForContext(mood: Dict = {}, opportunity: Partial<Opportunity> = {}): RinState {
  const primary = String(mood.primary ?? '').toUpperCase();
  const irritability = num(mood.irritability, 50);
  const energy = num(mood.energy, 50);
  const curiosity = num(mood.curiosity, 50);
  const type = String(opportunity.type ?? '').toUpperCase();

  if (['CASUAL_THOUGHT', 'CURRENT_INTEREST', 'RECOMMENDATION_THOUGHT'].includes(type)) {
    if (primary.includes('TIRED') || energy < 30) return 'TIRED';
    if (primary.includes('HAPPY') || primary.includes('GOOD')) return 'SOFT_SMILE';
    if (primary.includes('PLAYFUL') || primary.includes('SMUG') || primary.includes('GRUMPY'))
      return 'SMUG';
    if (primary.includes('CURIOUS') || curiosity > 80) return 'FOCUSED';
    return 'NEUTRAL';
  }
  if (type === 'NEWS') return 'FOCUSED';
  if (type === 'WEATHER') {
    const interpretation = (opportunity.data?.interpretation ?? {}) as Dict;
    const sentiment = String(interpretation.sentiment ?? '').toUpperCase();
    if (
      sentiment.includes('ANGRY') ||
      sentiment.includes('ANNOYED') ||
      sentiment.includes('BAD') ||
      irritability > 72
    )
      return 'ANGRY_POUT';
    if (primary.includes('TIRED') || energy < 30) return 'TIRED';
    return 'NEUTRAL';
  }
  if (primary.includes('TIRED') || energy < 30) return 'TIRED';
  if (primary.includes('PLAYFUL') || primary.includes('SMUG')) return 'SMUG';
  if (primary.includes('CURIOUS') || curiosity > 80) return 'FOCUSED';
  if (primary.includes('HAPPY') || primary.includes('GOOD')) return 'SOFT_SMILE';
  return 'NEUTRAL';
}

export function nextInitiativeAfterSend(
  previousInitiative: Dict,
  initiative: NormalizedInitiative,
  opportunity: Opportunity,
  message: string,
  now: Date,
  localDate: string,
): Record<string, unknown> {
  const nextTopics = [
    ...initiative.lastTopics.filter((topic) => topic !== opportunity.topic),
    opportunity.topic,
  ].slice(-8);
  return {
    ...previousInitiative,
    ...initiative,
    messagesSentToday: initiative.messagesSentToday + 1,
    messagesSentDate: localDate,
    lastProactiveAt: now.toISOString(),
    lastTopics: nextTopics,
    lastProactiveMessage: {
      topic: opportunity.topic,
      type: opportunity.type,
      message: message.slice(0, 500),
      sentAt: now.toISOString(),
    },
  };
}
