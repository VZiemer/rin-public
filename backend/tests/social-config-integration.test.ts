import { expect, test, vi } from 'vitest';
import {
  defaultAssistantBehavior,
  type PersonalityDefinition,
  type SocialConfig,
} from '../src/domain/model/assistant-behavior.js';
import type {
  AgentModelGateway,
  ModelRequest,
  ModelResponse,
} from '../src/application/ports/model.js';
import { AgentContextBuilder } from '../src/application/agent/context-builder.js';
import { SystemPromptRenderer } from '../src/application/agent/prompt-renderer.js';
import { AgentLoop } from '../src/application/agent/loop.js';
import { AgentToolExecutor, AgentToolRegistry } from '../src/application/agent/tools.js';
import { BehaviorRuntime } from '../src/application/behavior/runtime.js';
import { RunAgent } from '../src/application/use-cases/run-agent.js';
import { SkillRuntime } from '../src/application/skills/runtime.js';
import { createSkillRegistry } from '../src/application/skills/catalog.js';
import { SkillEnablement } from '../src/application/skills/enablement.js';
import { InMemoryActiveSubjectRepository } from '../src/adapters/outbound/memory/active-subject-repository.js';
import { InMemoryDomainRecordRepository } from '../src/adapters/outbound/memory/domain-record-repository.js';
import { InMemoryPendingSkillOperationRepository } from '../src/adapters/outbound/memory/pending-skill-operation-repository.js';
import { InMemorySkillEnablementRepository } from '../src/adapters/outbound/memory/skill-enablement-repository.js';

const now = new Date('2026-10-16T15:00:00.000Z');
const maximum: SocialConfig = { familiarity: 100, profanityLevel: 100, humorLevel: 100 };
const final: ModelResponse = {
  type: 'final',
  output: {
    message: 'Tudo certo por aqui.',
    avatarState: 'NEUTRAL',
    priority: 'NORMAL',
    actions: [],
  },
};

async function fixture(
  options: {
    assistantId?: 'RIN' | 'YUI';
    socialConfig?: SocialConfig | null;
    jokingProfanity?: boolean;
  } = {},
) {
  const assistantId = options.assistantId ?? 'RIN';
  const config = options.socialConfig === undefined ? maximum : options.socialConfig;
  const state = {
    ...defaultAssistantBehavior('u', assistantId, now),
    ...(config ? { socialConfig: config } : {}),
  };
  const personality: PersonalityDefinition = {
    id: 'tsundere',
    name: 'Tsundere',
    version: 1,
    enabled: true,
    traits: { sarcasm: 0.7 },
    guidance: ['Be helpful and truthful.'],
  };
  const behavior = new BehaviorRuntime(
    { get: async () => state, save: async () => undefined },
    { get: async () => personality, insertMissing: async () => undefined },
  );
  const builder = new AgentContextBuilder(
    {
      behavior,
      persona: {
        get: async () => ({
          userId: 'u',
          name: assistantId === 'RIN' ? 'Rin' : 'Yui',
          traits: {},
          core: ['Be useful.'],
          behavior: {},
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
        put: async () => true,
      },
      profile: { get: async () => null, put: async () => true },
      relationship: {
        get: async () => ({
          userId: 'u',
          assistant: assistantId,
          relationship: [],
          externalCommunication: [],
          boundaries: { conversation: { jokingProfanity: options.jokingProfanity ?? false } },
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
        put: async () => true,
      },
      routine: { get: async () => null, put: async () => true },
      people: { list: async () => [], get: async () => null, put: async () => true },
    },
    { get: async () => ({ currentTime: now.toISOString(), timezone: 'America/Sao_Paulo' }) },
  );
  const context = await builder.build('u', 'c', assistantId);
  const renderer = new SystemPromptRenderer();
  const generate = vi.fn<AgentModelGateway['generate']>().mockResolvedValue(final);
  const registry = new AgentToolRegistry([]);
  const loop = new AgentLoop({ generate }, registry, new AgentToolExecutor(registry));
  const feedback = { dispatch: vi.fn(async () => undefined) };
  const agent = new RunAgent(
    builder,
    renderer,
    loop,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    feedback,
  );
  return { builder, context, state, renderer, generate, feedback, agent, loop };
}

function runtime(renderer: SystemPromptRenderer, model: AgentModelGateway) {
  const skills = createSkillRegistry();
  return new SkillRuntime({
    skills,
    enablement: new SkillEnablement(skills, new InMemorySkillEnablementRepository()),
    subjects: new InMemoryActiveSubjectRepository(),
    domainRecords: new InMemoryDomainRecordRepository(),
    pending: new InMemoryPendingSkillOperationRepository(),
    handlers: [],
    tools: [],
    model,
    renderer,
    clock: { now: () => now },
  });
}

test('real renderer receives the latest distressed message and activates the support override', async () => {
  const { renderer, context } = await fixture();
  const prompt = renderer.render(context, 'Rin, tô muito mal hoje.');
  expect(prompt).toContain('RIN SOCIAL CONFIG:');
  expect(prompt).toContain('RIN CURRENT TURN — SERIOUS SUPPORT:');
  expect(prompt).toContain('no sarcasm, teasing, dark humor, insults or comic punchlines');
  expect(prompt).not.toContain('Keep teasing light and non-explicit.');
});

test('SkillRuntime forwards the user message on the ordinary full-context path', async () => {
  const { renderer, context, generate } = await fixture();
  const render = vi.spyOn(renderer, 'render');
  const message = 'Rin, tô muito mal hoje.';
  const output = await runtime(renderer, { generate }).handle({
    userId: 'u',
    assistantId: 'RIN',
    conversationId: 'c',
    message,
    context,
  });
  expect(output.message).toBe(final.type === 'final' ? final.output.message : '');
  expect(render).toHaveBeenCalledWith(context, message);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0]?.[0].message).toBe(message);
  expect(generate.mock.calls[0]?.[0].systemPrompt).toContain('RIN CURRENT TURN — SERIOUS SUPPORT:');
  expect(generate.mock.calls[0]?.[0].systemPrompt).toContain('ACTIVE_SKILL:');
});

test('SkillRuntime forwards character banter through the same social controls', async () => {
  const { renderer, context, generate } = await fixture();
  const render = vi.spyOn(renderer, 'render');
  const message = 'Se eu ganhar na loteria, te compro roupas.';
  await runtime(renderer, { generate }).handle({
    userId: 'u',
    assistantId: 'RIN',
    conversationId: 'c',
    message,
    context,
  });
  expect(render).toHaveBeenCalledWith(context, message);
  const request = generate.mock.calls[0]?.[0];
  expect(request?.systemPrompt).toContain('RIN SOCIAL CONFIG:');
  expect(request?.systemPrompt).toContain('"caralho"');
  expect(request?.systemPrompt).not.toContain('RIN CURRENT TURN — SERIOUS SUPPORT:');
  expect(request?.systemPrompt).not.toContain('ACTIVE_SKILL:');
  expect(request?.tools).toEqual([]);
});

test('RunAgent sends explicit Rin banter consent to the feedback classifier', async () => {
  const { agent, feedback, generate, state } = await fixture();
  const original = structuredClone(state);
  await agent.execute('u', 'E aí, biscate!', 'c', { assistantId: 'RIN', turnId: 'turn-1' });
  expect(feedback.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      assistantId: 'RIN',
      message: 'E aí, biscate!',
      playfulBanterAllowed: true,
    }),
  );
  expect(generate.mock.calls[0]?.[0].systemPrompt).toContain('RIN SOCIAL CONFIG:');
  expect(state).toEqual(original);
});

test('production RunAgent and SkillRuntime stack carries social settings and feedback together', async () => {
  const { builder, renderer, loop, generate, feedback } = await fixture();
  const skills = runtime(renderer, { generate });
  const agent = new RunAgent(
    builder,
    renderer,
    loop,
    undefined,
    undefined,
    skills,
    undefined,
    undefined,
    feedback,
  );
  await agent.execute('u', 'E aí, biscate!', 'c', { assistantId: 'RIN', turnId: 'turn-social' });
  expect(generate.mock.calls[0]?.[0].systemPrompt).toContain('RIN SOCIAL CONFIG:');
  expect(feedback.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      playfulBanterAllowed: true,
      skill: 'conversation',
    }),
  );

  generate.mockClear();
  feedback.dispatch.mockClear();
  await agent.execute('u', 'Rin, tô muito mal hoje.', 'c', {
    assistantId: 'RIN',
    turnId: 'turn-care',
  });
  expect(generate.mock.calls[0]?.[0].systemPrompt).toContain('RIN CURRENT TURN — SERIOUS SUPPORT:');
  expect(feedback.dispatch).not.toHaveBeenCalled();
});

test.each(['Rin, tô muito mal hoje.', 'Tô realmente muito mal.', 'Quero desabafar.'])(
  'RunAgent does not score distress as interpersonal hostility: %s',
  async (message) => {
    const { agent, feedback, generate } = await fixture();
    await agent.execute('u', message, 'c', { assistantId: 'RIN', turnId: 'turn-1' });
    expect(feedback.dispatch).not.toHaveBeenCalled();
    expect(generate.mock.calls[0]?.[0].systemPrompt).toContain(
      'RIN CURRENT TURN — SERIOUS SUPPORT:',
    );
  },
);

test.each([
  [null, false, false],
  [null, true, true],
  [{ familiarity: 0, profanityLevel: 0, humorLevel: 0 }, false, false],
  [{ familiarity: 0, profanityLevel: 0, humorLevel: 0, teasingLevel: 25 }, false, true],
] as const)(
  'Rin feedback preserves legacy consent and independent social dimensions: %j, %s',
  async (socialConfig, jokingProfanity, allowed) => {
    const { agent, feedback } = await fixture({ socialConfig, jokingProfanity });
    await agent.execute('u', 'Oi Rin, tudo certo?', 'c', { assistantId: 'RIN', turnId: 'turn-1' });
    expect(feedback.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        playfulBanterAllowed: allowed,
      }),
    );
  },
);

test.each([false, true])(
  'Rin social settings leave sibling Yui consent unchanged: %s',
  async (legacy) => {
    const { agent, feedback, generate } = await fixture({
      assistantId: 'YUI',
      jokingProfanity: legacy,
    });
    const output = await agent.execute('u', 'Oi Yui, tudo certo?', 'c', {
      assistantId: 'YUI',
      turnId: 'turn-1',
    });
    expect(output.assistantId).toBe('YUI');
    expect(feedback.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: 'YUI',
        playfulBanterAllowed: legacy,
      }),
    );
    const request: ModelRequest | undefined = generate.mock.calls[0]?.[0];
    expect(request?.systemPrompt).not.toContain('RIN SOCIAL CONFIG:');
    expect(request?.systemPrompt).not.toContain('RIN CURRENT TURN — SERIOUS SUPPORT:');
  },
);
