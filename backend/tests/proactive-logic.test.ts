import { expect, test } from 'vitest';
import {
  avatarForContext,
  calculateScore,
  canAttempt,
  chooseOpportunity,
  inferTopic,
  normalizeInitiative,
  type ProactiveConfig,
} from '../src/application/use-cases/proactive-logic.js';
import { localDateTime } from '../src/application/agent/clock-zone.js';

const config: ProactiveConfig = {
  timezone: 'America/Sao_Paulo',
  minCooldownMinutes: 180,
  maxMessagesPerDay: 3,
  baseChance: 0.1,
  quietHoursStart: '23:30',
  quietHoursEnd: '08:00',
};

test('normalizeInitiative resets daily counter across days and clamps chance', () => {
  const same = normalizeInitiative(
    { messagesSentDate: '2026-01-02', messagesSentToday: 5, baseChance: 9 },
    '2026-01-02',
    config,
  );
  expect(same.messagesSentToday).toBe(5);
  expect(same.baseChance).toBeLessThanOrEqual(0.85);
  const nextDay = normalizeInitiative(
    { messagesSentDate: '2026-01-01', messagesSentToday: 5 },
    '2026-01-02',
    config,
  );
  expect(nextDay.messagesSentToday).toBe(0);
});

test('canAttempt gates on force, quiet hours, cooldown and daily limit', () => {
  const now = new Date('2026-01-02T15:00:00Z'); // 12:00 local
  const local = localDateTime(now, config.timezone);
  const base = normalizeInitiative({}, local.date, config);
  expect(canAttempt({ now, local, initiative: base, force: true }).reason).toBe('forced');
  expect(
    canAttempt({ now, local, initiative: { ...base, proactiveEnabled: false }, force: false })
      .reason,
  ).toBe('proactive_disabled');
  expect(
    canAttempt({ now, local, initiative: { ...base, messagesSentToday: 3 }, force: false }).reason,
  ).toBe('daily_limit');
  const quietNow = new Date('2026-01-02T03:00:00Z'); // 00:00 local, inside quiet hours
  expect(
    canAttempt({
      now: quietNow,
      local: localDateTime(quietNow, config.timezone),
      initiative: base,
      force: false,
    }).reason,
  ).toBe('quiet_hours');
  expect(
    canAttempt({
      now,
      local,
      initiative: { ...base, lastProactiveAt: new Date(now.getTime() - 60_000).toISOString() },
      force: false,
    }).reason,
  ).toBe('cooldown');
});

test('chooseOpportunity returns highest weight with a zero roll and respects requested topic', () => {
  const state = { currentThoughts: ['li um mangá novo'], currentInterests: ['cosplay'] };
  const world = {
    weather: { facts: { condition: 'rain' }, changed: true },
    news: { items: [{ id: 'n1', category: 'tech', rinInterest: 0.9 }] },
  };
  const pick = chooseOpportunity({
    state,
    preferences: {},
    world,
    requestedTopic: null,
    random: { next: () => 0 },
  });
  expect(pick.type).toBe('NEWS');
  const requested = chooseOpportunity({
    state,
    preferences: {},
    world,
    requestedTopic: 'cosplay',
    random: { next: () => 0 },
  });
  expect(requested.topic).toBe('cosplay');
});

test('calculateScore starts from base chance and stays within bounds', () => {
  const initiative = normalizeInitiative({}, '2026-01-02', config);
  const info = calculateScore({
    state: {},
    world: {},
    opportunity: { type: 'CASUAL_THOUGHT', topic: 'casual', weight: 0.25, id: 'c', data: {} },
    initiative,
    lastConversationAt: null,
    now: new Date(),
  });
  expect(info.factors[0]).toEqual({ factor: 'base', delta: 0.1 });
  expect(info.score).toBeGreaterThanOrEqual(0.01);
  expect(info.score).toBeLessThanOrEqual(0.72);
});

test('avatarForContext keeps casual chat friendly and reacts to weather sentiment', () => {
  expect(
    avatarForContext({ energy: 20 }, { type: 'CASUAL_THOUGHT' }),
  ).toBe('TIRED');
  expect(avatarForContext({}, { type: 'NEWS' })).toBe('FOCUSED');
  expect(
    avatarForContext({}, { type: 'WEATHER', data: { interpretation: { sentiment: 'BAD' } } }),
  ).toBe('ANGRY_POUT');
  expect(inferTopic('vou de cosplay')).toBe('cosplay');
});
