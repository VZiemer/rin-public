import { expect, test, vi } from 'vitest';
import { AgentContextBuilder } from '../src/application/agent/context-builder.js';
import { characterBanterPrompt } from '../src/application/agent/character-banter.js';
import { SystemPromptRenderer } from '../src/application/agent/prompt-renderer.js';
import {
  rinUnsolicitedSocialStyle,
  rinUserLedFlirtStyle,
} from '../src/application/agent/rin-conversation-style.js';
import { rinFlirtGuidance } from '../src/application/agent/rin-flirt-preferences.js';
import { withRinTextStyle } from '../src/application/agent/rin-style-text.js';
import { socialStyle } from '../src/application/behavior/social-style.js';
import type { RinTextRequest } from '../src/application/ports/text-gateway.js';
import {
  defaultAssistantBehavior,
  type BehaviorSnapshot,
} from '../src/domain/model/assistant-behavior.js';
import { contextFixture } from './context-builder.test.js';

const now = new Date('2026-10-17T15:00:00.000Z');

function behavior(score = 0): BehaviorSnapshot {
  return {
    state: {
      ...defaultAssistantBehavior('u', 'RIN', now),
      moodScore: score,
      intimacyScore: score,
      socialConfig: { familiarity: 100, profanityLevel: 100, humorLevel: 100 },
    },
    personality: {
      id: 'tsundere',
      name: 'Tsundere',
      version: 1,
      enabled: true,
      traits: { sarcasm: 0.8 },
      guidance: ['Reply naturally to the actual user message.'],
    },
    currentMoodScore: score,
  };
}

async function context() {
  const ctx = await new AgentContextBuilder(contextFixture(), {
    get: async () => ({ currentTime: now.toISOString(), timezone: 'America/Sao_Paulo' }),
  }).build('u', 'c', 'RIN');
  return {
    ...ctx,
    behavior: behavior(),
    relationship: {
      ...ctx.relationship,
      boundaries: {
        conversation: { flirtation: 'deflect', explicitSexualContent: false },
      },
    },
  };
}

test('full conversation prompt retains user initiative and rejects with zero scores', async () => {
  const prompt = new SystemPromptRenderer().render(await context(), 'Rin, vem flertar comigo.');
  expect(prompt).toContain(rinUserLedFlirtStyle);
  expect(rinUserLedFlirtStyle).toMatch(/^RIN USER-LED SOCIAL EXCHANGE:/);
  expect(rinUserLedFlirtStyle).toContain('Never initiate flirting');
  expect(rinUserLedFlirtStyle).toContain('reciprocate naturally');
  expect(rinUserLedFlirtStyle).toContain('past flirt is not a new invitation');
  expect(rinUserLedFlirtStyle).toContain('Stop when asked or when the user changes subject');
  expect(prompt).toContain('"canReciprocate":false');
  expect(prompt).toContain('RIN FLIRT RESPONSE — REJECT:');
  expect(prompt).not.toContain('Reciprocal flirting is unavailable');
  expect(prompt).not.toContain('Intimacy below 8 does not permit reciprocal flirting');
});

test('flirt guidance preserves user-led exchange despite legacy deflection metadata', async () => {
  const ctx = await context();
  const prompt = rinFlirtGuidance(ctx.relationship, ctx.rinState, ctx.behavior);
  expect(prompt).toContain(rinUserLedFlirtStyle);
  expect(prompt).toContain('"canReciprocate":false');
  expect(prompt).not.toContain('Keep teasing light and non-explicit.');
  expect(prompt).not.toContain('Reciprocal flirting is unavailable');
});

test('isolated character route cannot bypass the user initiative rule', async () => {
  const ctx = await context();
  const message = 'Se eu ganhar na loteria te compro roupas.';
  expect(characterBanterPrompt(ctx, message)).toContain(rinUserLedFlirtStyle);
  const prompt = new SystemPromptRenderer().render(ctx, message);
  expect(prompt).toContain(rinUserLedFlirtStyle);
  expect(prompt).toContain('actions=[]');
});

test('social style without a current user turn does not seed sexual propositions', () => {
  const proactive = socialStyle(behavior(10));
  expect(proactive).not.toContain('RIN CRUDE PROPOSITIONS:');
  expect(proactive).not.toContain('Rin, quer transar?');
  const conversational = socialStyle(behavior(), 'Rin, quer transar?');
  expect(conversational).toContain('RIN CRUDE PROPOSITIONS:');
  expect(conversational).not.toContain('Hoje a única coisa que você vai comer é o jantar.');
});

test('unsolicited message wrapper ends with no-initiation guidance despite maximum social state and past flirting', async () => {
  const complete = vi
    .fn<(request: RinTextRequest) => Promise<string>>()
    .mockResolvedValue('Lembrete pronto.');
  const gateway = withRinTextStyle({ complete }, async () => behavior(10));
  const request: RinTextRequest = {
    systemPrompt:
      'Compose a reminder with Rin personality. Previous conversation included flirting.',
    message: JSON.stringify({
      reminder: 'Pagar a Internet',
      pastConversation: [{ message: 'Vem flertar comigo.', reply: 'Pode tentar me conquistar.' }],
    }),
    maxTokens: 100,
    temperature: 0.6,
  };
  await expect(gateway.complete(request)).resolves.toBe('Lembrete pronto.');
  const captured = complete.mock.calls[0]![0];
  expect(captured.systemPrompt).toContain('RIN SOCIAL CONFIG:');
  expect(captured.systemPrompt.endsWith(rinUnsolicitedSocialStyle)).toBe(true);
  expect(rinUnsolicitedSocialStyle).toMatch(/^RIN UNSOLICITED MESSAGE:/);
  expect(rinUnsolicitedSocialStyle).toContain('Never introduce or resume flirting');
  expect(rinUnsolicitedSocialStyle).toContain('do not authorize starting or reopening');
  expect(captured.systemPrompt).not.toContain('RIN CRUDE PROPOSITIONS:');
  expect(captured.message).toBe(request.message);
  expect(captured.maxTokens).toBe(request.maxTokens);
});

test('unsolicited message wrapper applies its initiative rule without saved behavior', async () => {
  const complete = vi
    .fn<(request: RinTextRequest) => Promise<string>>()
    .mockResolvedValue('Bom dia.');
  await withRinTextStyle({ complete }).complete({
    systemPrompt: 'Write a morning greeting.',
    message: 'A new day has started.',
    maxTokens: 50,
    temperature: 0.5,
  });
  expect(complete.mock.calls[0]![0].systemPrompt.endsWith(rinUnsolicitedSocialStyle)).toBe(true);
});
