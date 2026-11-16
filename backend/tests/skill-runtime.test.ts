import { expect, test, vi } from 'vitest';
import type { AgentModelGateway, ModelResponse } from '../src/application/ports/model.js';
import { AgentContextBuilder } from '../src/application/agent/context-builder.js';
import { currentTimeTool } from '../src/application/agent/tools.js';
import { defineTool } from '../src/application/agent/tools.js';
import { InMemoryActiveSubjectRepository } from '../src/adapters/outbound/memory/active-subject-repository.js';
import { InMemoryDomainRecordRepository } from '../src/adapters/outbound/memory/domain-record-repository.js';
import { InMemoryPendingSkillOperationRepository } from '../src/adapters/outbound/memory/pending-skill-operation-repository.js';
import { InMemorySkillEnablementRepository } from '../src/adapters/outbound/memory/skill-enablement-repository.js';
import { SystemPromptRenderer } from '../src/application/agent/prompt-renderer.js';
import { assertSkillBudget } from '../src/application/skills/budget.js';
import { createSkillRegistry } from '../src/application/skills/catalog.js';
import { SkillEnablement } from '../src/application/skills/enablement.js';
import { SkillRuntime } from '../src/application/skills/runtime.js';
import { registryForSkill, requiresSkillConfirmation } from '../src/application/skills/tool-view.js';
import type { PendingSkillOperation } from '../src/application/ports/pending-skill-operation.js';
import { z } from 'zod';
import { contextFixture } from './context-builder.test.js';

const now = new Date('2026-10-11T15:00:00.000Z');

async function context() {
  const builder = new AgentContextBuilder(contextFixture(), {
    get: async () => ({ currentTime: now.toISOString(), timezone: 'America/Sao_Paulo' }),
  });
  return builder.build('user-a', 'c1', 'RIN');
}

function operation(id: string): PendingSkillOperation {
  return {
    id,
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
    skillId: 'finance',
    name: 'correct_expense',
    summary: 'corrigir um lançamento',
    payload: { entryId: id },
    expiresAt: '2026-10-11T16:00:00.000Z',
    status: 'pending',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

const finalReply = (message = 'seguindo a conversa'): ModelResponse => ({
  type: 'final',
  output: { message, avatarState: 'NEUTRAL', priority: 'NORMAL', actions: [] },
});

function runtime(options: {
  generate?: AgentModelGateway['generate'];
  handlers?: ConstructorParameters<typeof SkillRuntime>[0]['handlers'];
  applyPending?: ConstructorParameters<typeof SkillRuntime>[0]['applyPending'];
  events?: { name: string; fields?: Record<string, string | number | boolean> | undefined }[];
  enablement?: SkillEnablement;
  pending?: InMemoryPendingSkillOperationRepository;
}) {
  const skills = createSkillRegistry();
  return new SkillRuntime({
    skills,
    enablement:
      options.enablement ?? new SkillEnablement(skills, new InMemorySkillEnablementRepository()),
    subjects: new InMemoryActiveSubjectRepository(),
    domainRecords: new InMemoryDomainRecordRepository(),
    pending: options.pending ?? new InMemoryPendingSkillOperationRepository(),
    handlers: options.handlers ?? [],
    tools: [
      currentTimeTool({ now: () => now }),
      defineTool({
        name: 'create_task',
        description: 'create',
        risk: 'WRITE',
        inputSchema: z.object({}).strict(),
        execute: async () => ({ ok: true }),
      }),
    ],
    model: { generate: options.generate ?? (async () => finalReply()) },
    renderer: new SystemPromptRenderer(),
    log: {
      event: (name, fields) => options.events?.push(fields ? { name, fields } : { name }),
    },
    clock: { now: () => now },
    applyPending: options.applyPending,
  });
}

test('ordinary conversation still answers and a disabled skill falls back', async () => {
  const events: { name: string; fields?: Record<string, string | number | boolean> | undefined }[] = [];
  const seen: string[][] = [];
  const generate: AgentModelGateway['generate'] = async (request) => {
    seen.push(request.tools.map((tool) => tool.name));
    return finalReply();
  };
  const built = await context();
  const ordinary = runtime({ generate, events });
  const output = await ordinary.handle({
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
    message: 'oi',
    context: built,
  });
  expect(output.message).toBe('seguindo a conversa');
  expect(JSON.stringify(events)).not.toContain('oi');

  const skills = createSkillRegistry();
  const enablement = new SkillEnablement(skills, new InMemorySkillEnablementRepository());
  await enablement.setEnabled('user-a', 'RIN', 'finance', false, now);
  const fallback = runtime({ generate, enablement, events });
  await fallback.handle({
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
    message: 'gastei 10 reais no mercado',
    context: built,
  });
  expect(seen.at(-1)).toContain('create_task');
  expect(events.some((event) => event.fields?.skillId === 'conversation')).toBe(true);
});

test('a skill failure does not claim that data was saved', async () => {
  const events: { name: string; fields?: Record<string, string | number | boolean> | undefined }[] = [];
  const agent = runtime({
    events,
    handlers: [
      {
        skillId: 'finance',
        handle: async () => {
          throw new Error('TOKEN-SEGREDO-42');
        },
      },
    ],
  });
  const output = await agent.handle({
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
    message: 'gastei 10 reais no mercado',
    context: await context(),
  });
  expect(output.message).toMatch(/Nothing was recorded/);
  expect(output.message).not.toMatch(/registrei|consultei/i);
  expect(JSON.stringify(events)).not.toContain('TOKEN-SEGREDO-42');
  expect(JSON.stringify(events)).not.toContain('reais');
});

test('yes applies only one unequivocal pending operation', async () => {
  const pending = new InMemoryPendingSkillOperationRepository();
  const applyPending = vi.fn(async () => ({
    skillId: 'finance' as const,
    facts: [{ id: 'done', statement: 'A correção pendente foi aplicada.' }],
    calculated: [],
    explanations: [],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'measured' as const, allowSarcasm: false },
  }));
  const built = await context();
  const none = runtime({ pending, applyPending });
  const ignored = await none.handle({
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
    message: 'sim',
    context: built,
  });
  expect(applyPending).not.toHaveBeenCalled();
  expect(ignored.message).toBe('seguindo a conversa');

  await pending.put(operation('a'));
  await pending.put(operation('b'));
  const ambiguous = await runtime({ pending, applyPending }).handle({
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
    message: 'sim',
    context: built,
  });
  expect(ambiguous.message).toMatch(/more than one pending operation/);
  expect(applyPending).not.toHaveBeenCalled();

  const single = new InMemoryPendingSkillOperationRepository();
  await single.put(operation('only'));
  const approved = await runtime({ pending: single, applyPending }).handle({
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
    message: 'sim',
    context: built,
  });
  expect(approved.message).toMatch(/correção pendente/);
  expect((await single.get('user-a', 'RIN', 'only'))?.status).toBe('applied');

  const failing = new InMemoryPendingSkillOperationRepository();
  await failing.put(operation('boom'));
  const failed = await runtime({
    pending: failing,
    applyPending: async () => {
      throw new Error('down');
    },
  }).handle({
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
    message: 'sim',
    context: built,
  });
  expect(failed.message).toMatch(/Nothing was recorded/);
  expect((await failing.get('user-a', 'RIN', 'boom'))?.status).toBe('pending');
});

test('skill budgets and tool exposure stay explicit', () => {
  expect(() => assertSkillBudget({ elapsedMs: 12_001, modelCalls: 1 })).toThrow('agent_deadline_exceeded');
  expect(() => assertSkillBudget({ elapsedMs: 10, modelCalls: 7 })).toThrow('skill_budget_exceeded');
  expect(requiresSkillConfirmation('record_explicit_expense', 'WRITE')).toBe(false);
  expect(requiresSkillConfirmation('correct_expense', 'WRITE')).toBe(true);
  expect(requiresSkillConfirmation('list_entries', 'READ')).toBe(false);
  const registry = registryForSkill(
    [
      currentTimeTool({ now: () => now }),
      defineTool({
        name: 'create_task',
        description: 'create',
        risk: 'WRITE',
        inputSchema: z.object({}).strict(),
        execute: async () => null,
      }),
    ],
    createSkillRegistry().get('finance').allowedTools,
  );
  expect(registry.definitions().map((tool) => tool.name)).toEqual(['get_current_time']);
});
