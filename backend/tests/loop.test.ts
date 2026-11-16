import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { AgentLoop } from '../src/application/agent/loop.js';
import {
  AgentToolRegistry,
  AgentToolExecutor,
  defineTool,
} from '../src/application/agent/tools.js';
const final = {
  type: 'final',
  output: { message: 'ok', avatarState: 'idle', priority: 'normal', actions: [] },
};
const call = { type: 'tool_call', call: { id: '1', name: 'read', input: {} } };
const ctx = { userId: 'u', conversationId: 'c' };
function fixture(fail = false) {
  const execute = vi.fn(async () => {
    if (fail) throw new Error('secret');
    return 'ok';
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
  return { registry, execute };
}
test('direct response and read roundtrip', async () => {
  const { registry, execute } = fixture();
  const generate = vi.fn().mockResolvedValueOnce(call).mockResolvedValue(final);
  const loop = new AgentLoop({ generate }, registry, new AgentToolExecutor(registry));
  expect((await loop.run({ message: 'hi', systemPrompt: '' }, ctx)).message).toBe('ok');
  expect(execute).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[1]?.[0].results).toHaveLength(1);
  expect((await loop.run({ message: 'hi', systemPrompt: '' }, ctx)).message).toBe('ok');
});
test('executes multiple independent tool calls in one model turn', async () => {
  const first = vi.fn(async () => 'one');
  const second = vi.fn(async () => 'two');
  const registry = new AgentToolRegistry([
    defineTool({
      name: 'alpha',
      description: 'alpha',
      risk: 'READ',
      inputSchema: z.object({}).strict(),
      execute: first,
    }),
    defineTool({
      name: 'beta',
      description: 'beta',
      risk: 'READ',
      inputSchema: z.object({}).strict(),
      execute: second,
    }),
  ]);
  const generate = vi
    .fn()
    .mockResolvedValueOnce({
      type: 'tool_calls',
      calls: [
        { id: '1', name: 'alpha', input: {} },
        { id: '2', name: 'beta', input: {} },
      ],
    })
    .mockResolvedValue(final);
  const output = await new AgentLoop(
    { generate },
    registry,
    new AgentToolExecutor(registry),
  ).run({ message: 'hi', systemPrompt: '' }, ctx);
  expect(output.message).toBe('ok');
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[1]?.[0].results).toHaveLength(2);
});
test('failure is sanitized, unknown tools and exhaustion stop execution', async () => {
  const { registry } = fixture(true);
  const generate = vi.fn().mockResolvedValueOnce(call).mockResolvedValue(final);
  await new AgentLoop({ generate }, registry, new AgentToolExecutor(registry)).run(
    { message: '', systemPrompt: '' },
    ctx,
  );
  expect(generate.mock.calls[1]?.[0].results[0].error).toBe('secret');
  await expect(
    new AgentLoop(
      { generate: vi.fn().mockResolvedValue(call) },
      registry,
      new AgentToolExecutor(registry),
    ).run({ message: '', systemPrompt: '' }, ctx),
  ).rejects.toThrow('max_tool_iterations');
  await expect(
    new AgentLoop(
      { generate: vi.fn().mockResolvedValue({ ...call, call: { ...call.call, name: 'unknown' } }) },
      registry,
      new AgentToolExecutor(registry),
    ).run({ message: '', systemPrompt: '' }, ctx),
  ).rejects.toThrow('unknown_tool');
});
