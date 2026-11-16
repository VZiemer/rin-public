import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { InMemoryActiveSubjectRepository } from '../src/adapters/outbound/memory/active-subject-repository.js';
import { InMemoryDomainRecordRepository } from '../src/adapters/outbound/memory/domain-record-repository.js';
import { InMemoryPendingSkillOperationRepository } from '../src/adapters/outbound/memory/pending-skill-operation-repository.js';
import { InMemorySkillEnablementRepository } from '../src/adapters/outbound/memory/skill-enablement-repository.js';
import { AgentContextBuilder } from '../src/application/agent/context-builder.js';
import { SystemPromptRenderer } from '../src/application/agent/prompt-renderer.js';
import { defineTool } from '../src/application/agent/tools.js';
import type {
  AgentModelGateway,
  ModelRequest,
  ModelResponse,
} from '../src/application/ports/model.js';
import { createSkillRegistry } from '../src/application/skills/catalog.js';
import { SkillEnablement } from '../src/application/skills/enablement.js';
import { SkillRuntime } from '../src/application/skills/runtime.js';
import { defaultAssistantBehavior } from '../src/domain/model/assistant-behavior.js';
import { rememberSelection, selectSkill } from '../src/application/skills/select-intent.js';
import type { SkillSelection } from '../src/domain/skills/subject.js';
import { contextFixture } from './context-builder.test.js';

const now = new Date('2026-10-17T15:00:00.000Z');

test('a user can continue the current flirt after a pause without an extra time gate', () => {
  const input = {
    userId: 'u',
    assistantId: 'RIN',
    conversationId: 'c',
    now,
    message: 'Rin, flerta comigo.',
    active: null,
    anchors: [],
  };
  const active = rememberSelection(input, selectSkill(input));
  const later = { ...input, active, now: new Date(now.getTime() + 90 * 60_000) };
  expect(selectSkill({ ...later, message: 'Continua.' })).toMatchObject({
    primary: 'flirt',
    reason: 'continued',
  });
  const changed = rememberSelection(later, selectSkill({ ...later, message: 'Bom dia.' }));
  expect(selectSkill({ ...later, active: changed, message: 'Continua.' }).primary).toBe(
    'conversation',
  );
});

async function harness(assistantId: 'RIN' | 'YUI' = 'RIN', enabled = true) {
  const context = await new AgentContextBuilder(contextFixture(), {
    get: async () => ({ currentTime: now.toISOString(), timezone: 'America/Sao_Paulo' }),
  }).build('u', 'social-chat', assistantId);
  context.relationship = {
    ...context.relationship,
    boundaries: { conversation: { flirtation: 'deflect', jokingProfanity: false } },
  };
  context.behavior = {
    state: {
      ...defaultAssistantBehavior('u', assistantId, now),
      moodScore: 0,
      intimacyScore: 0,
    },
    currentMoodScore: 0,
    personality: {
      id: 'tsundere',
      name: 'Tsundere',
      version: 1,
      enabled: true,
      traits: { tsundere: 1 },
      guidance: ['Responda com humor seco e familiaridade.'],
    },
  };
  const skills = createSkillRegistry();
  const enablement = new SkillEnablement(skills, new InMemorySkillEnablementRepository());
  await enablement.setEnabled('u', assistantId, 'flirt', enabled, now);
  const requests: ModelRequest[] = [];
  const selections: SkillSelection[] = [];
  const executed = vi.fn(async () => ({ ok: true }));
  const generate = vi.fn<AgentModelGateway['generate']>(async (request) => {
    requests.push(request);
    return {
      type: 'final',
      output: {
        message: 'Olha a coragem desse sujeito.',
        avatarState: 'SMUG',
        priority: 'HIGH',
        actions: [{ type: 'LOCAL_TOOL', tool: 'focus.start', payload: { minutes: 10 } }],
      },
    } satisfies ModelResponse;
  });
  const runtime = new SkillRuntime({
    skills,
    enablement,
    subjects: new InMemoryActiveSubjectRepository(),
    domainRecords: new InMemoryDomainRecordRepository(),
    pending: new InMemoryPendingSkillOperationRepository(),
    handlers: [],
    tools: [
      ['get_mood', 'READ'],
      ['get_relationship_state', 'READ'],
      ['get_current_time', 'READ'],
      ['list_tasks', 'READ'],
      ['create_task', 'WRITE'],
      ['query_finance_summary', 'READ'],
      ['record_finance_movement', 'WRITE'],
    ].map(([name, risk]) =>
      defineTool({
        name: name!,
        description: name!,
        risk: risk as 'READ' | 'WRITE',
        inputSchema: z.object({}).strict(),
        execute: executed,
      }),
    ),
    model: { generate },
    renderer: new SystemPromptRenderer(),
    clock: { now: () => now },
  });
  return {
    context,
    requests,
    selections,
    executed,
    generate,
    send: (message: string) =>
      runtime.handle({
        userId: 'u',
        assistantId,
        conversationId: 'social-chat',
        message,
        context,
        onSelection: (choice) => selections.push(choice),
      }),
  };
}

test.each(['Rin, você está linda, me provoca.', 'Ooo Rin, quer transar?'])(
  'enabled Rin routes a low-score flirt to rejection without operational tools: %s',
  async (message) => {
    const chat = await harness();
    const output = await chat.send(message);

    expect(chat.selections.at(-1)?.primary).toBe('flirt');
    expect(chat.requests).toHaveLength(1);
    expect(chat.requests[0]?.systemPrompt).toContain('FLIRT SKILL:');
    expect(chat.requests[0]?.systemPrompt).toContain('"canReciprocate":false');
    expect(chat.requests[0]?.systemPrompt).toContain('RIN FLIRT RESPONSE — REJECT:');
    expect(chat.requests[0]?.tools.map((tool) => tool.name)).toEqual([
      'get_mood',
      'get_relationship_state',
    ]);
    expect(chat.executed).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      message: 'Olha a coragem desse sujeito.',
      priority: 'NORMAL',
      actions: [],
    });
  },
);

test.each(['Rin, por que alguém quer transar?', 'Você sabe o que é sexo?'])(
  'a factual sexual question remains conversation: %s',
  async (message) => {
    const chat = await harness();
    await chat.send(message);

    expect(chat.selections.at(-1)?.primary).toBe('conversation');
    expect(chat.requests).toHaveLength(1);
    expect(chat.requests[0]?.systemPrompt).not.toContain('FLIRT SKILL:');
    expect(chat.requests[0]?.tools.map((tool) => tool.name)).toContain('list_tasks');
    expect(chat.executed).not.toHaveBeenCalled();
  },
);

test('Rin flirt does not require an older relationship preference to be present', async () => {
  const chat = await harness();
  chat.context.relationship = { ...chat.context.relationship, boundaries: {} };
  await chat.send('Rin, me beija.');

  expect(chat.selections.at(-1)?.primary).toBe('flirt');
  expect(chat.requests[0]?.systemPrompt).toContain('FLIRT SKILL:');
});

test.each(['list_tasks', 'create_task'])(
  'the flirt runtime rejects an operational tool call to %s',
  async (name) => {
    const chat = await harness();
    chat.generate.mockResolvedValueOnce({
      type: 'tool_call',
      call: { id: 'unavailable-operation', name, input: {} },
    });

    await expect(chat.send('Rin, me beija.')).rejects.toThrow('unknown_tool');
    expect(chat.selections.at(-1)?.primary).toBe('flirt');
    expect(chat.executed).not.toHaveBeenCalled();
  },
);

test.each([
  ['YUI', true],
  ['RIN', false],
] as const)('%s with flirt enabled=%s uses conversation instead', async (assistantId, enabled) => {
  const chat = await harness(assistantId, enabled);
  await chat.send('Me beija.');

  expect(chat.selections.at(-1)?.primary).toBe('conversation');
  expect(chat.requests).toHaveLength(1);
  expect(chat.requests[0]?.systemPrompt).not.toContain('FLIRT SKILL:');
  expect(chat.requests[0]?.tools.map((tool) => tool.name)).toContain('create_task');
  expect(chat.executed).not.toHaveBeenCalled();
});

test('asking Rin to stop leaves the active flirt skill immediately', async () => {
  const chat = await harness();
  await chat.send('Rin, me beija.');
  expect(chat.selections.at(-1)?.primary).toBe('flirt');

  await chat.send('Pare de flertar comigo.');
  expect(chat.selections.at(-1)).toMatchObject({ primary: 'conversation', endedPrevious: true });
  expect(chat.requests.at(-1)?.systemPrompt).not.toContain('FLIRT SKILL:');
});

test.each([
  {
    message: 'Rin, sua linda, gastei 10 reais no mercado.',
    skill: 'finance',
    tools: [
      'get_mood',
      'get_relationship_state',
      'get_current_time',
      'query_finance_summary',
      'record_finance_movement',
    ],
  },
  {
    message: 'Rin, sua linda, estou triste e quero desabafar.',
    skill: 'support',
    tools: ['get_mood', 'get_relationship_state', 'get_current_time'],
  },
  {
    message: 'Crie uma tarefa para lavar a roupa.',
    skill: 'conversation',
    tools: ['get_mood', 'get_relationship_state', 'get_current_time', 'list_tasks', 'create_task'],
  },
])(
  'an active flirt yields to $skill while preserving its tool boundary',
  async ({ message, skill, tools }) => {
    const chat = await harness();
    await chat.send('Rin, me beija.');
    expect(chat.selections.at(-1)?.primary).toBe('flirt');

    await chat.send(message);
    expect(chat.selections.at(-1)?.primary).toBe(skill);
    expect(chat.requests.at(-1)?.systemPrompt).not.toContain('FLIRT SKILL:');
    expect(chat.requests.at(-1)?.tools.map((tool) => tool.name)).toEqual(tools);
    expect(chat.executed).not.toHaveBeenCalled();
  },
);
