import { expect, test } from 'vitest';
import { StaticAgentModelGateway } from '../src/adapters/outbound/agent-model/static.js';
import { modelResponseSchema } from '../src/domain/model/validation.js';
test('static gateway supports final and deterministic tool roundtrip', async () => {
  const model = new StaticAgentModelGateway();
  const request = { systemPrompt: '', message: 'simulate:time', tools: [], results: [] };
  expect(modelResponseSchema.parse(await model.generate(request)).type).toBe('tool_call');
  expect(
    modelResponseSchema.parse(
      await model.generate({
        ...request,
        results: [{ callId: 'static-time', name: 'get_current_time', output: 'now' }],
      }),
    ).type,
  ).toBe('final');
  expect(() =>
    modelResponseSchema.parse({ type: 'final', output: { message: 'invalid' } }),
  ).toThrow();
  expect(
    modelResponseSchema.parse({
      type: 'tool_calls',
      calls: [
        { id: '1', name: 'list_tasks', input: {} },
        { id: '2', name: 'list_reminders', input: {} },
      ],
    }).type,
  ).toBe('tool_calls');
});
