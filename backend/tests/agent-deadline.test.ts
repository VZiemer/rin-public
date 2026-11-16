import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { AgentLoop } from '../src/application/agent/loop.js';
import {
  AgentToolRegistry,
  AgentToolExecutor,
  defineTool,
} from '../src/application/agent/tools.js';
import type { AgentModelGateway } from '../src/application/ports/model.js';

const final = {
  type: 'final' as const,
  output: {
    message: 'ok',
    avatarState: 'NEUTRAL' as const,
    priority: 'NORMAL' as const,
    actions: [],
  },
};
const call = { type: 'tool_call' as const, call: { id: 'one', name: 'read', input: {} } };
const request = { message: 'hi', systemPrompt: '' };
const ctx = { userId: 'u', conversationId: 'c' };

test.each([12_000, 18_000])(
  'AgentLoop passes the remaining %i ms budget after tool execution',
  async (deadlineMs) => {
    let now = 100_000;
    const registry = new AgentToolRegistry([
      defineTool({
        name: 'read',
        description: 'read',
        risk: 'READ',
        inputSchema: z.object({}).strict(),
        execute: async () => {
          now += 800;
          return 'read';
        },
      }),
    ]);
    const generate = vi
      .fn<AgentModelGateway['generate']>()
      .mockImplementationOnce(async () => {
        now += 1200;
        return call;
      })
      .mockResolvedValue(final);
    const loop = new AgentLoop(
      { generate },
      registry,
      new AgentToolExecutor(registry),
      5,
      undefined,
      undefined,
      undefined,
      () => now,
      // The 12s case deliberately relies on the constructor default.
      deadlineMs === 12_000 ? undefined : deadlineMs,
    );
    expect((await loop.run(request, ctx)).message).toBe('ok');
    expect(generate.mock.calls[0]?.[0].timeoutMs).toBe(deadlineMs);
    expect(generate.mock.calls[1]?.[0].timeoutMs).toBe(deadlineMs - 2000);
    expect(generate.mock.calls[1]?.[0].results).toHaveLength(1);
  },
);

test('AgentLoop does not start another provider call after the custom budget runs out', async () => {
  let now = 0;
  const execute = vi.fn(async () => {
    now += 18_000;
    return 'read';
  });
  const registry = new AgentToolRegistry([
    defineTool({
      name: 'read',
      description: 'read',
      risk: 'READ',
      inputSchema: z.object({}).strict(),
      execute,
    }),
  ]);
  const generate = vi.fn<AgentModelGateway['generate']>().mockResolvedValue(call);
  const loop = new AgentLoop(
    { generate },
    registry,
    new AgentToolExecutor(registry),
    5,
    undefined,
    undefined,
    undefined,
    () => now,
    18_000,
  );
  await expect(loop.run(request, ctx)).rejects.toThrow('agent_deadline_exceeded');
  expect(generate).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(1);
});

test.each([0, -1, 0.5, NaN, Infinity])(
  'AgentLoop rejects invalid request budget %s',
  (deadlineMs) => {
    const registry = new AgentToolRegistry([]);
    expect(
      () =>
        new AgentLoop(
          { generate: async () => final },
          registry,
          new AgentToolExecutor(registry),
          5,
          undefined,
          undefined,
          undefined,
          () => 0,
          deadlineMs,
        ),
    ).toThrow('Invalid agent deadline');
  },
);
