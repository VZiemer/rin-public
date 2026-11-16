import { expect, test, vi } from 'vitest';
import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentModelGateway } from '../src/adapters/outbound/agent-model/bedrock.js';
const request = { systemPrompt: 'system', message: 'hi', tools: [], results: [] };
test('Bedrock maps tool calls, structured final and result pairs', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({
      output: {
        message: {
          content: [{ toolUse: { toolUseId: 'id', name: 'get_current_time', input: {} } }],
        },
      },
    })
    .mockResolvedValueOnce({
      output: {
        message: {
          content: [
            {
              toolUse: {
                name: 'respond',
                input: { message: 'ok', avatarState: 'idle', priority: 'normal', actions: [] },
              },
            },
          ],
        },
      },
    });
  const model = new BedrockAgentModelGateway(
    { send } as Pick<BedrockRuntimeClient, 'send'>,
    'model',
  );
  expect(await model.generate(request)).toEqual({
    type: 'tool_call',
    call: { id: 'id', name: 'get_current_time', input: {} },
  });
  expect(
    (
      await model.generate({
        ...request,
        results: [{ callId: 'id', name: 'get_current_time', output: { time: 'now' } }],
      })
    ).type,
  ).toBe('final');
  expect(send.mock.calls[1]?.[0].input.messages).toHaveLength(3);
  send.mockRejectedValueOnce(new Error('secret'));
  await expect(model.generate(request)).rejects.toThrow('model_unavailable');
  send.mockResolvedValueOnce({ output: { message: { content: [{ text: 'not JSON' }] } } });
  expect(await model.generate(request)).toMatchObject({
    type: 'final',
    output: { message: 'not JSON', avatarState: 'NEUTRAL' },
  });
});
test('Nova uses tool choice and normalizes omitted empty actions without accepting invalid states', async () => {
  const send = vi.fn().mockResolvedValue({
    output: {
      message: {
        content: [
          {
            toolUse: {
              name: 'respond',
              input: { message: 'ok', avatarState: 'idle', priority: 'normal' },
            },
          },
        ],
      },
    },
  });
  const model = new BedrockAgentModelGateway(
    { send } as Pick<BedrockRuntimeClient, 'send'>,
    'model',
  );
  expect(await model.generate(request)).toMatchObject({ type: 'final', output: { actions: [] } });
  expect(send.mock.calls[0]?.[0].input.toolConfig.toolChoice).toEqual({ auto: {} });
  const schema = send.mock.calls[0]?.[0].input.toolConfig.tools[0].toolSpec.inputSchema.json;
  expect(Object.keys(schema).sort()).toEqual(['properties', 'required', 'type']);
  send.mockResolvedValueOnce({
    output: {
      message: {
        content: [
          {
            toolUse: {
              name: 'respond',
              input: { message: 'ok', avatarState: 'invalid', priority: 'normal', actions: [] },
            },
          },
        ],
      },
    },
  });
  expect(await model.generate(request)).toMatchObject({
    type: 'final',
    output: { message: 'ok', avatarState: 'NEUTRAL', actions: [] },
  });
});
test('successful parameterless reads are not offered repeatedly within a run', async () => {
  const send = vi.fn().mockResolvedValue({
    output: {
      message: {
        content: [
          {
            toolUse: {
              name: 'respond',
              input: { message: 'ok', avatarState: 'idle', priority: 'normal', actions: [] },
            },
          },
        ],
      },
    },
  });
  const model = new BedrockAgentModelGateway(
    { send } as Pick<BedrockRuntimeClient, 'send'>,
    'model',
  );
  const tool = {
    name: 'get_current_time',
    description: 'time',
    risk: 'READ' as const,
    inputSchema: { type: 'object', properties: {} },
  };
  await model.generate({
    ...request,
    tools: [tool],
    results: [{ callId: '1', name: tool.name, input: {}, output: { currentTime: 'now' } }],
  });
  expect(
    send.mock.calls[0]?.[0].input.toolConfig.tools.map(
      (v: { toolSpec: { name: string } }) => v.toolSpec.name,
    ),
  ).toEqual(['respond']);
});
test('parses plain text, protocol markup and multiple operational tool calls', async () => {
  const { parsePlainModelText } = await import('../src/adapters/outbound/agent-model/bedrock.js');
  expect(parsePlainModelText('Oi, tudo bem?').message).toBe('Oi, tudo bem?');
  expect(
    parsePlainModelText(
      '<thinking>plan</thinking><respond message="Pronto" avatarState="SMUG" priority="LOW">',
    ),
  ).toMatchObject({ message: 'Pronto', avatarState: 'SMUG', priority: 'LOW' });
  expect(
    parsePlainModelText('<response>{"message":"ok","avatarState":"FOCUSED","priority":"NORMAL","actions":[]}</response>'),
  ).toMatchObject({ message: 'ok', avatarState: 'FOCUSED' });
  const send = vi.fn().mockResolvedValue({
    output: {
      message: {
        content: [
          { toolUse: { toolUseId: '1', name: 'list_tasks', input: {} } },
          { toolUse: { toolUseId: '2', name: 'list_reminders', input: { limit: 5 } } },
        ],
      },
    },
  });
  const model = new BedrockAgentModelGateway(
    { send } as Pick<BedrockRuntimeClient, 'send'>,
    'model',
  );
  expect(await model.generate(request)).toEqual({
    type: 'tool_calls',
    calls: [
      { id: '1', name: 'list_tasks', input: {} },
      { id: '2', name: 'list_reminders', input: { limit: 5 } },
    ],
  });
});
