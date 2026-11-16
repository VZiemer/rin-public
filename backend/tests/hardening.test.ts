import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { AgentLoop } from '../src/application/agent/loop.js';
import {
  AgentToolRegistry,
  AgentToolExecutor,
  defineTool,
} from '../src/application/agent/tools.js';
import { Confirmations, ConfirmationPolicy } from '../src/application/agent/confirmation.js';
import type { PendingConfirmation } from '../src/domain/model/contracts.js';
import { event } from './http-fixture.js';
test('IAM authorizer event is accepted in dev, never substitutes JWT in production', async () => {
  const deps = {
    environment: 'dev' as const,
    devUserId: 'u',
    allowDevUserFallback: true,
    ids: { next: () => 'c' },
    agent: {
      execute: vi.fn(async () => ({
        message: 'ok',
        avatarState: 'NEUTRAL' as const,
        priority: 'NORMAL' as const,
        actions: [],
      })),
    },
  };
  const base = event('POST', '/agent/message', { message: 'hi' });
  const input = {
    ...base,
    requestContext: {
      ...base.requestContext,
      authorizer: { iam: { userArn: 'arn:aws:iam::123:user/test' } },
    },
  };
  expect((await createHandler(deps)(input)).statusCode).toBe(200);
  expect((await createHandler({ ...deps, environment: 'production' })(input)).statusCode).toBe(401);
  expect((await createHandler(deps)({ ...base, body: '{' })).statusCode).toBe(400);
  expect((await createHandler(deps)({ ...base, body: 'x'.repeat(40000) })).statusCode).toBe(413);
});
test('write loop executes immediately because confirmation UI is disabled', async () => {
  let record: PendingConfirmation | null = null;
  let now = new Date('2026-01-01');
  const execute = vi.fn(async () => 'written');
  const registry = new AgentToolRegistry([
    defineTool({
      name: 'write',
      description: 'write',
      risk: 'WRITE',
      inputSchema: z.object({ title: z.string() }).strict(),
      execute,
    }),
  ]);
  const executor = new AgentToolExecutor(registry);
  const confirmations = new Confirmations(
    {
      create: async (v) => {
        record = v;
      },
      get: async () => record,
      transition: async (u, id, from, to) => {
        if (!record || record.status !== from) return false;
        record.status = to;
        return true;
      },
    },
    { now: () => now },
    { next: () => 'id' },
    executor,
  );
  const generate = vi
    .fn()
    .mockResolvedValueOnce({
      type: 'tool_call' as const,
      call: { id: 'call', name: 'write', input: { title: 'approved content' } },
    })
    .mockResolvedValue({
      type: 'final' as const,
      output: { message: 'feito', avatarState: 'NEUTRAL', priority: 'NORMAL', actions: [] },
    });
  const loop = new AgentLoop(
    { generate },
    registry,
    executor,
    5,
    new ConfirmationPolicy(),
    confirmations,
  );
  const output = await loop.run(
    { message: 'create', systemPrompt: '' },
    { userId: 'u', conversationId: 'c' },
  );
  expect(output.message).toBe('feito');
  expect(execute).toHaveBeenCalledTimes(1);
  expect(record).toBeNull();
  await confirmations.request(
    { id: 'call', name: 'write', input: { title: 'approved content' } },
    { userId: 'u', conversationId: 'c' },
  );
  await confirmations.decide('u', 'id', false);
  now = new Date('2026-01-02');
  await expect(confirmations.decide('u', 'id', true)).rejects.toThrow('unavailable');
});
test('loop deadline stops further model invocations', async () => {
  const registry = new AgentToolRegistry([]);
  const generate = vi.fn();
  const time = vi.fn().mockReturnValueOnce(0).mockReturnValue(13000);
  await expect(
    new AgentLoop(
      { generate },
      registry,
      new AgentToolExecutor(registry),
      5,
      new ConfirmationPolicy(),
      undefined,
      undefined,
      time,
    ).run({ message: 'x', systemPrompt: '' }, { userId: 'u', conversationId: 'c' }),
  ).rejects.toThrow('deadline');
  expect(generate).not.toHaveBeenCalled();
});
