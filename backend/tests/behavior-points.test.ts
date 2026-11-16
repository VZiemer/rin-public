import { expect, test, vi } from 'vitest';
import {
  defaultAssistantBehavior,
  type AssistantBehavior,
  type BehaviorSnapshot,
} from '../src/domain/model/assistant-behavior.js';
import {
  evolveBehavior,
  moodScoreAt,
  type InteractionEvent,
  type InteractionAssessment,
} from '../src/domain/model/behavior-evolution.js';
import {
  resolveRinFlirtDisposition,
  rinFlirtGuidance,
} from '../src/application/agent/rin-flirt-preferences.js';
import { BehaviorRuntime } from '../src/application/behavior/runtime.js';
import { ProcessBehaviorInteraction } from '../src/application/behavior/process-interaction.js';
import type { BehaviorEvolutionRepository } from '../src/application/ports/behavior-evolution.js';

const start = new Date('2026-10-17T12:00:00Z');
const day = '2026-10-17';
const friendly: InteractionAssessment = {
  signal: 'friendly',
  reason: 'friendly_exchange',
  confidence: 0.8,
};
const rude: InteractionAssessment = {
  signal: 'offensive',
  reason: 'direct_hostility',
  confidence: 0.95,
};
function state(): AssistantBehavior {
  return defaultAssistantBehavior('u', 'RIN', start);
}
function snapshot(moodScore: number, intimacyScore: number): BehaviorSnapshot {
  return {
    state: { ...state(), moodScore, intimacyScore },
    currentMoodScore: moodScore,
    personality: {
      id: 'tsundere',
      name: 'Tsundere',
      version: 1,
      enabled: true,
      traits: {},
      guidance: ['Speak naturally.'],
    },
  };
}
function event(
  sequence: number,
  message = 'Obrigado pela ajuda, Rin. Você me ajudou muito hoje.',
): InteractionEvent {
  return {
    userId: 'u',
    assistantId: 'RIN',
    eventId: `event-${sequence}`,
    conversationId: 'c',
    occurredAt: new Date(start.getTime() + sequence * 2000).toISOString(),
    timezone: 'America/Sao_Paulo',
    skill: 'conversation',
    message,
    reply: 'Certo.',
    playfulBanterAllowed: true,
  };
}
function apply(
  current: AssistantBehavior,
  sequence: number,
  assessment = friendly,
  message?: string,
) {
  const turn = event(sequence, message);
  return evolveBehavior(current, turn, assessment, new Date(turn.occurredAt), day);
}

test.each([
  [7, 8, true, 'available'],
  [10, 7.9, false, 'low_intimacy'],
  [3, 10, false, 'bad_mood'],
  [6.9, 10, false, 'neutral_mood'],
  [0, 0, false, 'bad_mood'],
] as const)(
  'mood %s and intimacy %s resolve reciprocity=%s',
  (mood, intimacy, canReciprocate, reason) => {
    expect(resolveRinFlirtDisposition(null, snapshot(mood, intimacy))).toMatchObject({
      canReciprocate,
      reason,
    });
    const prompt = rinFlirtGuidance(null, null, snapshot(mood, intimacy));
    expect(prompt).toContain(
      canReciprocate ? 'RIN FLIRT RESPONSE — RECIPROCATE:' : 'RIN FLIRT RESPONSE — REJECT:',
    );
    expect(prompt).not.toContain(
      canReciprocate ? 'RIN FLIRT RESPONSE — REJECT:' : 'RIN FLIRT RESPONSE — RECIPROCATE:',
    );
  },
);

test('bad mood has a curt, rude rejection while low intimacy has a sharp rejection', () => {
  expect(rinFlirtGuidance(null, null, snapshot(1, 10))).toContain('curt, irritable, sarcastic');
  expect(rinFlirtGuidance(null, null, snapshot(10, 2))).toContain('sharp, dismissive comeback');
});

test('sleepiness alone does not block good mood but actual irritability does', () => {
  const sleepy = {
    userId: 'u',
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
    mood: { primary: 'SLEEPY', energy: 10, score: 8, irritability: 20, patience: 80 },
  };
  expect(resolveRinFlirtDisposition(sleepy, snapshot(8, 10)).canReciprocate).toBe(true);
  expect(
    resolveRinFlirtDisposition(
      { ...sleepy, mood: { ...sleepy.mood, irritability: 70 } },
      snapshot(8, 10),
    ),
  ).toMatchObject({ canReciprocate: false, reason: 'bad_mood' });
});

test('meaningful kindness raises both scores on consecutive turns, including confidence 0.8', () => {
  const first = apply(state(), 1);
  const second = apply(first.state!, 2);
  expect(first).toMatchObject({ moodDelta: 0.2, intimacyDelta: 0.1 });
  expect(second.state).toMatchObject({ moodScore: 5.4, intimacyScore: 3.2, version: 2 });
});

test('genuine rudeness lowers both scores immediately after kindness, even with banter enabled', () => {
  const kind = apply(state(), 1).state!;
  const hostile = apply(kind, 2, rude, 'Cala a boca, sua inútil. Você é um lixo.');
  expect(hostile).toMatchObject({
    reason: 'direct_hostility',
    moodDelta: -0.5,
    intimacyDelta: -0.2,
  });
  expect(hostile.state).toMatchObject({ moodScore: 4.7, intimacyScore: 2.9 });
});

test('line breaks do not exempt kindness or real hostility from evolution', () => {
  expect(
    apply(state(), 1, friendly, 'Rin,\nobrigado pela ajuda.\nVocê me ajudou muito.'),
  ).toMatchObject({ moodDelta: 0.2, intimacyDelta: 0.1 });
  expect(apply(state(), 1, rude, 'Cala a boca,\nsua inútil.')).toMatchObject({
    moodDelta: -0.5,
    intimacyDelta: -0.2,
  });
  expect(apply(state(), 1, rude, 'Foi isso que disseram:\n> Você é inútil.').state).toBeNull();
});

test('a changed intimacy score changes the next-turn flirt decision in either direction', () => {
  const near = { ...state(), moodScore: 7, intimacyScore: 7.9 };
  const kind = apply(near, 1).state!;
  const view = (value: AssistantBehavior) => ({
    ...snapshot(value.moodScore, value.intimacyScore),
    state: value,
  });
  expect(resolveRinFlirtDisposition(null, view(near)).canReciprocate).toBe(false);
  expect(resolveRinFlirtDisposition(null, view(kind)).canReciprocate).toBe(true);
  const hostile = apply(kind, 2, rude).state!;
  expect(resolveRinFlirtDisposition(null, view(hostile)).canReciprocate).toBe(false);
});

test.each([
  [friendly, 20, 7, 3.5],
  [rude, 12, 2, 2],
] as const)(
  'per-direction daily budgets bound repeated classified interactions',
  (assessment, count, moodScore, intimacyScore) => {
    let current = state();
    for (let n = 1; n <= count; n++) current = apply(current, n, assessment).state ?? current;
    expect(current).toMatchObject({ moodScore, intimacyScore });
  },
);

test.each([
  [friendly, 0.74, false],
  [friendly, 0.75, true],
  [rude, 0.89, false],
  [rude, 0.9, true],
] as const)(
  'confidence %s / %s has an explicit conservative boundary',
  (assessment, confidence, changes) => {
    expect(!!apply(state(), 1, { ...assessment, confidence }).state).toBe(changes);
  },
);

test.each([
  'Pare de flertar comigo.',
  'Sua resposta está errada, corrige esse bug.',
  'Estou triste e quero desabafar.',
  'Ele disse "você é inútil".',
])('boundaries, criticism, distress and quotation do not lose points: %s', (message) => {
  expect(apply(state(), 1, rude, message)).toMatchObject({ state: null, reason: 'protected' });
});

test('neutral, consensual banter and ambiguous hostility do not change scores', () => {
  expect(
    apply(state(), 1, { signal: 'neutral', reason: 'playful_banter', confidence: 0.99 }).state,
  ).toBeNull();
  expect(apply(state(), 1, rude, 'E aí sua puta kkk, brincadeira.').state).toBeNull();
  expect(apply(state(), 1, { ...rude, confidence: 0.7 }).state).toBeNull();
});

test('scores remain bounded and absent time recovers only mood toward neutral', () => {
  expect(apply({ ...state(), moodScore: 9.9, intimacyScore: 9.95 }, 1).state).toMatchObject({
    moodScore: 10,
    intimacyScore: 10,
  });
  expect(apply({ ...state(), moodScore: 0.1, intimacyScore: 0.1 }, 1, rude).state).toMatchObject({
    moodScore: 0,
    intimacyScore: 0,
  });
  const original = { ...state(), moodScore: 10, intimacyScore: 8 };
  expect(moodScoreAt(original, new Date(start.getTime() + 12 * 3600000))).toBe(8.8);
  expect(original.intimacyScore).toBe(8);
});

test('disabled evolution, stale events and events preceding manual changes remain protected', () => {
  expect(apply({ ...state(), evolutionEnabled: false }, 1).reason).toBe('disabled');
  expect(apply({ ...state(), lastManualChangeAt: event(2).occurredAt }, 1).reason).toBe(
    'manual_override',
  );
  expect(
    evolveBehavior(state(), event(1), friendly, new Date(start.getTime() + 2 * 3600000), day)
      .reason,
  ).toBe('expired');
});

test('sibling assistants retain their earlier evolution pace', () => {
  const sibling = { ...state(), assistantId: 'YUI' };
  const turn = { ...event(1), assistantId: 'YUI' };
  expect(evolveBehavior(sibling, turn, friendly, new Date(turn.occurredAt), day).reason).toBe(
    'low_confidence',
  );
  const first = evolveBehavior(
    sibling,
    turn,
    { ...friendly, confidence: 0.99 },
    new Date(turn.occurredAt),
    day,
  ).state!;
  const next = { ...event(2), assistantId: 'YUI' };
  expect(
    evolveBehavior(first, next, { ...friendly, confidence: 0.99 }, new Date(next.occurredAt), day)
      .state,
  ).toBeNull();
});

test('duplicate completed turns never reclassify or apply scores twice', async () => {
  const assess = vi.fn(async () => friendly);
  const commit = vi.fn<BehaviorEvolutionRepository['commit']>();
  const runtime = new BehaviorRuntime(
    { get: async () => state(), save: async () => undefined },
    { get: async () => snapshot(5, 3).personality, insertMissing: async () => undefined },
  );
  const process = new ProcessBehaviorInteraction(
    runtime,
    { fingerprint: () => 'f', seen: async () => true, commit },
    { assess },
    { now: () => start },
  );
  expect(await process.execute(event(1))).toEqual({ status: 'ignored', reason: 'duplicate' });
  expect(assess).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});
