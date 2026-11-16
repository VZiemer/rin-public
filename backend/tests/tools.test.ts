import { expect, test } from 'vitest';
import {
  AgentToolRegistry,
  AgentToolExecutor,
  currentTimeTool,
} from '../src/application/agent/tools.js';
test('explicit whitelist and schemas protect execution', async () => {
  const tool = currentTimeTool({ now: () => new Date('2026-01-01T00:00:00Z') });
  const registry = new AgentToolRegistry([tool]);
  const executor = new AgentToolExecutor(registry);
  const context = { userId: 'u', conversationId: 'c' };
  expect(() => new AgentToolRegistry([tool, tool])).toThrow();
  await expect(executor.execute({ id: '1', name: 'eval', input: {} }, context)).rejects.toThrow(
    'unknown_tool',
  );
  await expect(
    executor.execute({ id: '1', name: tool.name, input: { unexpected: true } }, context),
  ).rejects.toThrow();
  expect((await executor.execute({ id: '1', name: tool.name, input: {} }, context)).output).toEqual(
    { currentTime: '2026-01-01T00:00:00.000Z' },
  );
  expect(registry.definitions()[0]?.risk).toBe('READ');
});
