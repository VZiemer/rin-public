import { expect, test } from 'vitest';
import {
  assistantBehaviorSchema,
  defaultAssistantBehavior,
  socialConfigSchema,
  type BehaviorSnapshot,
} from '../src/domain/model/assistant-behavior.js';
import { behaviorStyle } from '../src/application/behavior/style.js';
import { isSeriousSocialTurn, socialStyle } from '../src/application/behavior/social-style.js';
import {
  characterBanterPrompt,
  isCharacterBanter,
} from '../src/application/agent/character-banter.js';
import { AgentContextBuilder } from '../src/application/agent/context-builder.js';
import {
  rinFlirtPreferencesSchema,
  rinFlirtGuidance,
} from '../src/application/agent/rin-flirt-preferences.js';
import {
  rinConversationStyle,
  rinPersonalityStyle,
} from '../src/application/agent/rin-conversation-style.js';

const now = new Date('2026-10-16T15:00:00.000Z');
const maximum = { familiarity: 100, profanityLevel: 100, humorLevel: 100 };

function snapshot(config: unknown = maximum, assistantId = 'RIN'): BehaviorSnapshot {
  return {
    state: assistantBehaviorSchema.parse({
      ...defaultAssistantBehavior('u', assistantId, now),
      ...(config === undefined ? {} : { socialConfig: config }),
    }),
    personality: {
      id: 'tsundere',
      name: 'Tsundere',
      version: 1,
      enabled: true,
      traits: { sarcasm: 0.7 },
      guidance: ['Be helpful, with occasional mild swearing only.'],
    },
    currentMoodScore: 5,
  };
}

async function context(behavior: BehaviorSnapshot) {
  const base = await new AgentContextBuilder(
    {
      persona: {
        put: async () => true,
        get: async () => ({
          userId: 'u',
          name: 'Rin',
          core: ['Be helpful.'],
          traits: {},
          behavior: {},
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
      },
      profile: { get: async () => null, put: async () => true },
      relationship: { get: async () => null, put: async () => true },
      routine: { get: async () => null, put: async () => true },
      people: { list: async () => [], get: async () => null, put: async () => true },
    },
    { get: async () => ({ currentTime: now.toISOString(), timezone: 'America/Sao_Paulo' }) },
  ).build('u', 'c');
  return { ...base, behavior };
}

test('legacy states and defaults omit socialConfig without changing relationship scores', () => {
  const state = defaultAssistantBehavior('u', 'RIN', now);
  expect(assistantBehaviorSchema.parse(state)).toEqual(state);
  expect(state).not.toHaveProperty('socialConfig');
  expect(state.moodScore).toBe(5);
  expect(state.intimacyScore).toBe(3);
  expect(socialStyle({ ...snapshot(), state })).toBe('');
  expect(socialStyle(null)).toBe('');
  expect(behaviorStyle(null)).toBe(rinPersonalityStyle.join('\n'));
  expect(behaviorStyle(undefined, true)).toBe(rinConversationStyle.join('\n'));
  expect(behaviorStyle({ ...snapshot(), state }, true)).toContain('natural swearing');
});

test.each([0, 100])('accepts each social dimension at the boundary %i', (level) => {
  const config = {
    familiarity: level,
    profanityLevel: level,
    humorLevel: level,
    sarcasmLevel: level,
    darkHumorLevel: level,
    teasingLevel: level,
  };
  expect(socialConfigSchema.parse(config)).toEqual(config);
  expect(snapshot(config).state.socialConfig).toEqual(config);
});

test.each([
  'familiarity',
  'profanityLevel',
  'humorLevel',
  'sarcasmLevel',
  'darkHumorLevel',
  'teasingLevel',
])('rejects non-integer and out-of-range values for %s', (field) => {
  for (const value of [-1, 101, 0.5, '100', null, NaN, Infinity]) {
    expect(socialConfigSchema.safeParse({ ...maximum, [field]: value }).success).toBe(false);
  }
});

test('rejects misspelled controls and incomplete explicit configurations', () => {
  expect(socialConfigSchema.safeParse({ ...maximum, familarity: 100 }).success).toBe(false);
  expect(socialConfigSchema.safeParse({ familiarity: 100 }).success).toBe(false);
});

test('maximum configuration enables strong contextual banter without requiring swearing', () => {
  const state = snapshot();
  const original = structuredClone(state);
  const prompt = behaviorStyle(state, true, 'E aí, biscate!');
  expect(prompt).toContain('RIN SOCIAL CONFIG:');
  expect(prompt).toContain('"darkHumorLevel":100');
  expect(prompt).toContain('"teasingLevel":100');
  expect(prompt).toContain('"sarcasmLevel":100');
  expect(prompt).toContain('"fuck"');
  expect(prompt).toContain('juvenile');
  expect(prompt).toContain('not a quota or a probability');
  expect(prompt).toContain('Do not insert profanity in every reply');
  expect(prompt).toContain('override conflicting legacy delivery defaults');
  expect(prompt).not.toContain('CONSENSUAL ROASTING:');
  expect(prompt).not.toContain('RIN CASUAL BANTER:');
  expect(prompt).toContain('Do not assume the user is married');
  expect(prompt).toContain('intimacy=3/10');
  expect(prompt).toContain('requires intimacy at least 8 and mood at least 7');
  expect(prompt).not.toContain('Intimacy below 8 does not permit reciprocal flirting');
  expect(prompt).toContain('tool permissions and confirmations');
  expect(prompt).toContain('Never target protected groups');
  expect(state).toEqual(original);
});

test('zero configuration disables every social dimension in the normal prompt', () => {
  const prompt = behaviorStyle(
    snapshot({ familiarity: 0, profanityLevel: 0, humorLevel: 0 }),
    true,
    'E aí, sua puta!',
  );
  expect(prompt).toContain('neutral, measured address');
  expect(prompt).toContain('Do not use swear words or profane insults');
  expect(prompt).toContain('do not add jokes or comic punchlines');
  expect(prompt).toContain('Do not use sarcasm');
  expect(prompt).toContain('Do not use dark or morbid jokes');
  expect(prompt).toContain('Do not roast, mock-scold or insult the user');
  expect(prompt).not.toContain('CONSENSUAL ROASTING:');
  expect(prompt).not.toContain('RIN CASUAL BANTER:');
});

test('independent dimensions override the inherited humor setting', () => {
  const prompt = socialStyle(
    snapshot({ ...maximum, sarcasmLevel: 0, teasingLevel: 0, darkHumorLevel: 0 }),
  );
  expect(prompt).toContain('"humorLevel":100');
  expect(prompt).toContain('Do not use sarcasm');
  expect(prompt).toContain('Do not use dark or morbid jokes');
  expect(prompt).toContain('Do not roast, mock-scold or insult the user');
});

test('low profanity allows only light swearing', () => {
  const prompt = socialStyle(snapshot({ ...maximum, profanityLevel: 10 }));
  expect(prompt).toContain('only occasional light swearing');
  expect(prompt).not.toContain('"fuck"');
});

test.each([
  'Rin, tô muito mal hoje.',
  'Estou triste; quando passar te levo à praia.',
  'Quero desabafar, você já comprou roupas?',
  'Não aguento mais, se melhorar te compro um pijama.',
  'Tive uma crise de pânico.',
])('suffering switches off banter despite maximum settings: %s', (message) => {
  expect(isSeriousSocialTurn(message)).toBe(true);
  expect(isCharacterBanter('RIN', message)).toBe(false);
  const prompt = behaviorStyle(snapshot(), true, message);
  expect(prompt).toContain('RIN CURRENT TURN — SERIOUS SUPPORT:');
  expect(prompt).toContain('no sarcasm, teasing, dark humor, insults or comic punchlines');
});

test.each([
  'E aí, biscate!',
  'E aí, sua puta!',
  'Rin, você tá gostosa hoje.',
  'Rin, enfia isso no cu.',
  'Se eu ganhar na loteria te compro roupas.',
])('ordinary provocation is not confused with distress: %s', (message) => {
  expect(isSeriousSocialTurn(message)).toBe(false);
  expect(behaviorStyle(snapshot(), true, message)).not.toContain(
    'RIN CURRENT TURN — SERIOUS SUPPORT:',
  );
});

test('isolated character conversations use the same social controls and support override', async () => {
  const ctx = await context(snapshot());
  const prompt = characterBanterPrompt(ctx, 'Se eu ganhar na loteria te compro roupas.');
  expect(prompt).toContain(socialStyle(ctx.behavior, 'Se eu ganhar na loteria te compro roupas.'));
  expect(prompt).toContain('"fuck"');
  expect(prompt).toContain('actions=[]');
  expect(characterBanterPrompt(ctx, 'Rin, tô muito mal hoje.')).toContain(
    'RIN CURRENT TURN — SERIOUS SUPPORT:',
  );
  const zero = await context(snapshot({ familiarity: 0, profanityLevel: 0, humorLevel: 0 }));
  expect(characterBanterPrompt(zero)).toContain('Do not use swear words or profane insults');
  expect(characterBanterPrompt(zero)).toContain('Do not roast, mock-scold or insult the user');
});

test('Rin social configuration never changes Yui delivery', () => {
  const yui = snapshot(maximum, 'YUI');
  expect(socialStyle(yui, 'E aí, biscate!')).toBe('');
  expect(behaviorStyle(yui, true)).not.toContain('RIN SOCIAL CONFIG:');
  expect(behaviorStyle(yui, true)).toContain('CONSENSUAL ROASTING:');
});

test('flirt guidance respects high social settings without retaining legacy light-only caps', () => {
  const prompt = rinFlirtGuidance(null, null, snapshot());
  expect(prompt).toContain('teasing intensity (100/100)');
  expect(prompt).toContain('profanity intensity (100/100)');
  expect(prompt).not.toContain('Keep teasing light and non-explicit.');
  expect(prompt).not.toContain('Do not add stronger profanity merely because the user flirts.');
  expect(prompt).toContain('"canReciprocate":false');
  expect(prompt).not.toContain('Reciprocal flirting is unavailable');
  expect(prompt).toContain('serious support/finance/task need');
});

test('social settings control delivery while scores govern reciprocal flirting', async () => {
  const ctx = await context(snapshot({ familiarity: 0, profanityLevel: 0, humorLevel: 0 }));
  const relationship = {
    ...ctx.relationship,
    boundaries: {
      conversation: {
        flirtation: 'reciprocate_when_happy',
        provocation: 'bold',
        jokingProfanity: true,
      },
    },
  };
  const happy = {
    ...ctx.behavior,
    state: { ...ctx.behavior.state, intimacyScore: 8 },
    currentMoodScore: 7,
  };
  const prompt = rinFlirtGuidance(relationship, null, ctx.behavior);
  expect(rinFlirtGuidance(relationship, null, happy)).toContain(
    'RIN FLIRT RESPONSE — RECIPROCATE:',
  );
  expect(prompt).toContain('RIN SOCIAL CONFIG disables teasing');
  expect(prompt).toContain('RIN SOCIAL CONFIG disables profanity');
  expect(prompt).toContain('RIN FLIRT RESPONSE — REJECT:');
  expect(prompt).not.toContain('bolder, mischievous wordplay');
  expect(prompt).not.toContain('Occasional conversational swearing is welcome');
});

test('legacy preferences no longer impose light-only language or automatic deflection', () => {
  const original = snapshot();
  const legacy = { ...original, state: defaultAssistantBehavior('u', 'RIN', now) };
  const prompt = rinFlirtGuidance(null, null, legacy);
  expect(prompt).not.toContain('Keep teasing light and non-explicit.');
  expect(prompt).not.toContain('Do not add stronger profanity merely because the user flirts.');
  expect(prompt).toContain('RIN FLIRT DISPOSITION:');
  expect(rinFlirtGuidance(null, null, snapshot(maximum, 'YUI'))).toBe(
    rinFlirtGuidance(null, null, legacy),
  );
});

test('legacy explicit-content metadata is accepted but never changes style or routing', async () => {
  const ctx = await context(snapshot());
  const guidance = (value: boolean) =>
    rinFlirtGuidance(
      {
        ...ctx.relationship,
        boundaries: { conversation: { explicitSexualContent: value, flirtation: 'deflect' } },
      },
      null,
      ctx.behavior,
    );
  expect(rinFlirtPreferencesSchema.parse({ explicitSexualContent: true })).toMatchObject({
    explicitSexualContent: true,
  });
  expect(guidance(true)).toBe(guidance(false));
  expect(guidance(false)).toContain('"canReciprocate":false');
});
