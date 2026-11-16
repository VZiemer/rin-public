import { expect, test, vi } from 'vitest';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentModelGateway } from '../src/adapters/outbound/agent-model/bedrock.js';
import { AgentLoop } from '../src/application/agent/loop.js';
import {
  AgentToolExecutor,
  AgentToolRegistry,
  defineTool,
} from '../src/application/agent/tools.js';
import { z } from 'zod';

const request = { systemPrompt: 'Você é Rin.', message: 'Oi.', tools: [], results: [] };
const output = { message: 'Oi.', avatarState: 'SMUG', priority: 'NORMAL', actions: [] };
const final = {
  stopReason: 'tool_use',
  output: {
    message: {
      role: 'assistant',
      content: [{ toolUse: { toolUseId: 'answer', name: 'respond', input: output } }],
    },
  },
};

test.each(['openai.gpt-oss-120b-1:0', 'openai.gpt-oss-20b-1:0'])(
  'GPT-OSS %s configures low reasoning and bounded token output',
  async (modelId) => {
    const send = vi.fn().mockResolvedValue(final);
    const model = new BedrockAgentModelGateway({ send }, modelId);
    expect(await model.generate(request)).toMatchObject({ type: 'final', output });
    const command = send.mock.calls[0]?.[0] as ConverseCommand;
    expect(command).toBeInstanceOf(ConverseCommand);
    expect(command.input.modelId).toBe(modelId);
    expect(command.input.additionalModelRequestFields).toEqual({ reasoning_effort: 'low' });
    expect(command.input.inferenceConfig).toEqual({ maxTokens: 4096, temperature: 0.6 });
  },
);

test('legacy Nova keeps its generation parameters and does not receive OpenAI fields', async () => {
  const send = vi.fn().mockResolvedValue(final);
  await new BedrockAgentModelGateway({ send }, 'amazon.nova-lite-v1:0').generate(request);
  const command = send.mock.calls[0]?.[0] as ConverseCommand;
  expect(command.input.inferenceConfig).toEqual({ maxTokens: 1500, temperature: 0.2 });
  expect(command.input.additionalModelRequestFields).toBeUndefined();
});

test.each([
  'max_tokens',
  'guardrail_intervened',
  'content_filtered',
  'model_context_window_exceeded',
])('GPT-OSS rejects incomplete or filtered output (%s)', async (stopReason) => {
  const send = vi.fn().mockResolvedValue({ ...final, stopReason });
  await expect(
    new BedrockAgentModelGateway({ send }, 'openai.gpt-oss-120b-1:0').generate(request),
  ).rejects.toMatchObject({ code: 'invalid_model_output' });
});

test('reasoning blocks are omitted from both display output and logs', async () => {
  const event = vi.fn();
  const send = vi
    .fn()
    .mockResolvedValue({
      stopReason: 'end_turn',
      output: {
        message: {
          role: 'assistant',
          content: [
            {
              reasoningContent: {
                reasoningText: { text: 'PRIVATE REASONING', signature: 'PRIVATE SIGNATURE' },
              },
            },
            { text: 'Oi, seu doido.' },
          ],
        },
      },
    });
  const result = await new BedrockAgentModelGateway({ send }, 'openai.gpt-oss-120b-1:0', {
    event,
  }).generate(request);
  expect(result).toMatchObject({ type: 'final', output: { message: 'Oi, seu doido.' } });
  expect(JSON.stringify(event.mock.calls)).not.toContain('PRIVATE');
});

test('expired remaining budget prevents any AWS inference', async () => {
  const send = vi.fn();
  await expect(
    new BedrockAgentModelGateway({ send }, 'openai.gpt-oss-120b-1:0').generate({
      ...request,
      timeoutMs: 0,
    }),
  ).rejects.toMatchObject({ code: 'agent_deadline_exceeded' });
  expect(send).not.toHaveBeenCalled();
});

test('text reasoning wrappers are stripped and model text is never logged', async () => {
  const event = vi.fn();
  const send = vi.fn().mockResolvedValue({
    stopReason: 'end_turn',
    output: {
      message: {
        role: 'assistant',
        content: [{ text: '<thinking>PRIVATE PLAN</thinking><response>Oi.</response>' }],
      },
    },
  });
  const result = await new BedrockAgentModelGateway({ send }, 'openai.gpt-oss-120b-1:0', {
    event,
  }).generate(request);
  expect(result).toMatchObject({ type: 'final', output: { message: 'Oi.' } });
  expect(event).toHaveBeenCalledWith('bedrock_output', {
    stopReason: 'end_turn',
    contentBlockCount: 1,
    toolCallCount: 0,
  });
  expect(JSON.stringify(event.mock.calls)).not.toContain('PRIVATE');
  expect(JSON.stringify(event.mock.calls)).not.toContain('Oi.');
});

test('a read-only tool roundtrip preserves parameters, results and the final answer', async () => {
  const execute = vi.fn(async () => ({ value: 'observed-value' }));
  const registry = new AgentToolRegistry([
    defineTool({
      name: 'read_value',
      description: 'Read value',
      risk: 'READ',
      inputSchema: z.object({ id: z.string() }).strict(),
      execute,
    }),
  ]);
  const send = vi
    .fn()
    .mockResolvedValueOnce({
      stopReason: 'tool_use',
      output: {
        message: {
          role: 'assistant',
          content: [{ toolUse: { toolUseId: 'read-1', name: 'read_value', input: { id: 'x' } } }],
        },
      },
    })
    .mockResolvedValueOnce({
      ...final,
      output: {
        message: {
          role: 'assistant',
          content: [
            {
              toolUse: {
                toolUseId: 'reply-1',
                name: 'respond',
                input: { ...output, message: 'observed-value' },
              },
            },
          ],
        },
      },
    });
  const model = new BedrockAgentModelGateway({ send }, 'openai.gpt-oss-120b-1:0');
  const result = await new AgentLoop(model, registry, new AgentToolExecutor(registry)).run(
    { systemPrompt: '', message: 'Read x' },
    { userId: 'u', conversationId: 'c' },
  );
  expect(result.message).toBe('observed-value');
  expect(execute).toHaveBeenCalledTimes(1);
  const command = send.mock.calls[1]?.[0] as ConverseCommand;
  expect(JSON.stringify(command.input.messages)).toContain('observed-value');
  expect(JSON.stringify(command.input.messages)).toContain('read-1');
  expect(JSON.stringify(command.input.messages)).toContain('"id":"x"');
});
