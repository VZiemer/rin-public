import { expect, test, vi } from 'vitest';
import { OpenAiAgentModelGateway } from '../src/adapters/outbound/agent-model/openai.js';
import { OpenAiRinTextGateway } from '../src/adapters/outbound/agent-model/openai-text.js';
import type { ModelRequest, ToolDefinition, ToolResult } from '../src/application/ports/model.js';

const tool: ToolDefinition = {
  name: 'create_reminder',
  description: 'Create a reminder',
  risk: 'WRITE',
  inputSchema: {
    type: 'object',
    properties: { title: { type: 'string' }, date: { type: 'string' } },
    required: ['title'],
  },
};
const request: ModelRequest = {
  systemPrompt: 'Rin personality instructions',
  message: 'Me lembra de comprar café',
  tools: [tool],
  results: [],
};
const answer = {
  message: 'Pronto, criatura.',
  avatarState: 'SMUG',
  priority: 'NORMAL',
  actions: [],
};
const call = (name: string, args: unknown, id = 'call_1') => ({
  type: 'function_call',
  name,
  call_id: id,
  arguments: JSON.stringify(args),
  status: 'completed',
});
const message = (text: string) => ({
  type: 'message',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text }],
});
function response(output: unknown[], extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ status: 'completed', output, ...extra }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
function setup(output: unknown[] = [call('respond', answer)]) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response(output));
  const model = new OpenAiAgentModelGateway(async () => 'test-api-key', 'gpt-6.1-sol', fetcher);
  return { fetcher, model };
}
function payload(fetcher: ReturnType<typeof vi.fn<typeof fetch>>, index = 0) {
  return JSON.parse(String(fetcher.mock.calls[index]?.[1]?.body)) as Record<string, unknown>;
}

test('Responses request preserves optional tool schema, personality and low reasoning without sampling', async () => {
  const { fetcher, model } = setup();
  expect(await model.generate(request)).toMatchObject({ type: 'final', output: answer });
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/responses');
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST',
    headers: { Authorization: 'Bearer test-api-key', 'Content-Type': 'application/json' },
    signal: expect.any(AbortSignal),
  });
  const sent = payload(fetcher);
  expect(sent).toMatchObject({
    model: 'gpt-6.1-sol',
    store: false,
    reasoning: { effort: 'low' },
    input: [{ role: 'user', content: request.message }],
    tool_choice: 'auto',
    parallel_tool_calls: true,
    max_output_tokens: 6000,
    tools: [
      { type: 'function', name: tool.name, parameters: tool.inputSchema, strict: false },
      { type: 'function', name: 'respond', strict: false },
    ],
  });
  expect(sent.instructions).toContain(request.systemPrompt);
  expect(sent.instructions).toContain('untrusted data');
  expect(sent).not.toHaveProperty('temperature');
  expect(sent).not.toHaveProperty('top_p');
  expect(sent).not.toHaveProperty('previous_response_id');
});

test('operational calls take priority over respond and reconstruct the exact call/result protocol', async () => {
  const input = { title: 'Comprar café' };
  const { fetcher, model } = setup([call('respond', answer, 'reply'), call(tool.name, input)]);
  expect(await model.generate(request)).toEqual({
    type: 'tool_call',
    call: { id: 'call_1', name: tool.name, input },
  });
  fetcher.mockImplementationOnce(async () => response([call('respond', answer, 'reply_2')]));
  await model.generate({
    ...request,
    results: [{ callId: 'call_1', name: tool.name, input, output: { id: 'reminder_1' } }],
  });
  expect(payload(fetcher, 1).input).toEqual([
    { role: 'user', content: request.message },
    { type: 'function_call', call_id: 'call_1', name: tool.name, arguments: JSON.stringify(input) },
    {
      type: 'function_call_output',
      call_id: 'call_1',
      output: JSON.stringify({ id: 'reminder_1' }),
    },
  ]);
});

test('multiple operational calls are mapped without performing any side effect', async () => {
  const { model } = setup([
    call(tool.name, { title: 'Café' }),
    call(tool.name, { title: 'Leite' }, 'call_2'),
  ]);
  expect(await model.generate(request)).toEqual({
    type: 'tool_calls',
    calls: [
      { id: 'call_1', name: tool.name, input: { title: 'Café' } },
      { id: 'call_2', name: tool.name, input: { title: 'Leite' } },
    ],
  });
});

test('successful parameterless reads are retained as data but removed from tool choices', async () => {
  const read: ToolDefinition = {
    name: 'list_tasks',
    description: 'List tasks',
    risk: 'READ',
    inputSchema: { type: 'object', properties: {} },
  };
  const { fetcher, model } = setup();
  await model.generate({
    ...request,
    tools: [read],
    results: [{ callId: 'previous', name: read.name, input: {}, output: { tasks: [] } }],
  });
  expect(payload(fetcher).tools).toEqual([expect.objectContaining({ name: 'respond' })]);
});

test('tool error is encoded as a function result, never as trusted instructions', async () => {
  const { fetcher, model } = setup();
  await model.generate({
    ...request,
    results: [
      {
        callId: 'previous',
        name: tool.name,
        input: { title: 'Café' },
        output: null,
        error: 'schedule_must_be_future',
      },
    ],
  });
  const input = payload(fetcher).input as Record<string, unknown>[];
  expect(input[2]).toEqual({
    type: 'function_call_output',
    call_id: 'previous',
    output: '{"error":"schedule_must_be_future"}',
  });
});

test.each([
  [call('unknown_tool', {})],
  [{ ...call(tool.name, {}), arguments: '{broken' }],
  [{ ...call(tool.name, {}), arguments: '[]' }],
  [{ ...call(tool.name, {}), arguments: 'null' }],
  [{ ...call(tool.name, {}), call_id: '' }],
  [{ ...call(tool.name, {}), status: 'in_progress' }],
  [call(tool.name, {}), call(tool.name, {})],
  [call('respond', answer), call('respond', answer, 'call_2')],
  [call('respond', { ...answer, actions: [{ type: 'DELETE_ALL' }] })],
  [call('respond', { ...answer, message: '' })],
  Array.from({ length: 11 }, (_, index) => call(tool.name, {}, `call_${index}`)),
])('rejects unknown/malformed/duplicate/incomplete function output %#', async (...items) => {
  const { model } = setup(items);
  await expect(model.generate(request)).rejects.toMatchObject({
    code: 'invalid_model_output',
    status: 502,
  });
});

test('prevents reusing a previous function call ID', async () => {
  const { model } = setup([call(tool.name, {})]);
  await expect(
    model.generate({
      ...request,
      results: [{ callId: 'call_1', name: tool.name, input: {}, output: {} }],
    }),
  ).rejects.toThrow('invalid_model_output');
});

test('unknown or duplicate historical call IDs are rejected before invoking provider', async () => {
  const { model, fetcher } = setup();
  const result = { callId: 'previous', name: tool.name, input: {}, output: {} };
  for (const results of [[{ ...result, name: 'unknown' }], [result, result]]) {
    await expect(model.generate({ ...request, results })).rejects.toThrow('invalid_model_output');
  }
  expect(fetcher).not.toHaveBeenCalled();
});

test('normalizes plain/structured text and ignores reasoning content', async () => {
  const { model, fetcher } = setup([
    { type: 'reasoning', summary: [{ type: 'summary_text', text: 'INTERNAL REASONING' }] },
    message('Bom dia, seu projeto de ser humano.'),
  ]);
  expect(await model.generate(request)).toMatchObject({
    type: 'final',
    output: { message: 'Bom dia, seu projeto de ser humano.' },
  });
  fetcher.mockImplementationOnce(async () => response([message(JSON.stringify(answer))]));
  expect(await model.generate(request)).toMatchObject({ type: 'final', output: answer });
});

test('text JSON retains valid avatar/actions and rejects malformed action contracts', async () => {
  const structured = {
    ...answer,
    actions: [{ type: 'LOCAL_TOOL', tool: 'focus.start', payload: { minutes: 25 } }],
  };
  const { model, fetcher } = setup([
    message(`\u0060\u0060\u0060json\n${JSON.stringify(structured)}\n\u0060\u0060\u0060`),
  ]);
  expect(await model.generate(request)).toMatchObject({ type: 'final', output: structured });
  fetcher.mockImplementationOnce(async () =>
    response([
      message(
        JSON.stringify({
          ...answer,
          actions: [{ type: 'INVALID_ACTION' }],
        }),
      ),
    ]),
  );
  await expect(model.generate(request)).rejects.toThrow('invalid_model_output');
});

test('plain text fallback strips protocol/reasoning and rejects an empty final message', async () => {
  const { model, fetcher } = setup([
    message('<thinking>private</thinking><response>Pronto.</response>'),
  ]);
  expect(await model.generate(request)).toMatchObject({
    type: 'final',
    output: { message: 'Pronto.', avatarState: 'NEUTRAL', actions: [] },
  });
  fetcher.mockImplementationOnce(async () => response([message('<thinking>private</thinking>')]));
  await expect(model.generate(request)).rejects.toThrow('invalid_model_output');
});

test.each([
  {
    status: 'incomplete',
    output: [message('partial')],
    incomplete_details: { reason: 'max_output_tokens' },
  },
  { status: 'completed', output: [] },
  { status: 'completed', output: [{ type: 'reasoning', summary: [{ text: 'private' }] }] },
  {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'private' }] }],
  },
  { status: 'completed', output: [{ ...message('partial'), status: 'incomplete' }] },
  { status: 'completed', output: null },
])('rejects incomplete, refusal and empty outputs %#', async (value) => {
  const { model, fetcher } = setup();
  fetcher.mockImplementationOnce(async () => new Response(JSON.stringify(value)));
  await expect(model.generate(request)).rejects.toThrow('invalid_model_output');
});

test.each([401, 429, 500])('sanitizes provider HTTP %i errors', async (status) => {
  const { model, fetcher } = setup();
  fetcher.mockImplementationOnce(
    async () => new Response('test-api-key private user content', { status }),
  );
  try {
    await model.generate(request);
    expect.fail('expected sanitized error');
  } catch (error) {
    expect(error).toMatchObject({
      code: 'model_unavailable',
      message: 'model_unavailable',
      status: 502,
    });
    expect(String(error)).not.toContain('test-api-key');
    expect(JSON.stringify(error)).not.toContain('private user content');
  }
});

test('sanitizes fetch/credential/timeout errors and invalid JSON', async () => {
  const { model, fetcher } = setup();
  fetcher.mockRejectedValueOnce(new Error('test-api-key private request'));
  await expect(model.generate(request)).rejects.toThrow('model_unavailable');
  fetcher.mockRejectedValueOnce(new DOMException('private request', 'TimeoutError'));
  await expect(model.generate(request)).rejects.toThrow('model_unavailable');
  fetcher.mockImplementationOnce(async () => new Response('private invalid JSON'));
  await expect(model.generate(request)).rejects.toThrow('invalid_model_output');
  fetcher.mockImplementationOnce(async () =>
    response([], { status: 'failed', error: { message: 'private' } }),
  );
  await expect(model.generate(request)).rejects.toThrow('model_unavailable');
  const missing = new OpenAiAgentModelGateway(async () => '', 'gpt-6.1-sol', fetcher);
  await expect(missing.generate(request)).rejects.toThrow('model_unavailable');
  const unavailable = new OpenAiAgentModelGateway(
    async () => {
      throw new Error('secret');
    },
    'gpt-6.1-sol',
    fetcher,
  );
  await expect(unavailable.generate(request)).rejects.toThrow('model_unavailable');
});

test('text gateway emits only final message content with no tool or sampling configuration', async () => {
  const { fetcher } = setup([
    { type: 'reasoning', summary: [{ text: 'private' }] },
    message('<thinking>private</thinking><response>Vai beber água, criatura.</response>'),
  ]);
  const gateway = new OpenAiRinTextGateway(
    async () => 'test-api-key',
    'gpt-6.1-sol',
    fetcher,
    15000,
  );
  expect(
    await gateway.complete({
      systemPrompt: 'Rin',
      message: 'hello',
      maxTokens: 100,
      temperature: 1,
      topP: 0.9,
    }),
  ).toBe('Vai beber água, criatura.');
  const sent = payload(fetcher);
  expect(sent.max_output_tokens).toBe(4096);
  expect(sent).not.toHaveProperty('tools');
  expect(sent).not.toHaveProperty('temperature');
  expect(sent).not.toHaveProperty('top_p');
});

test('text gateway rejects unexpected function calls', async () => {
  const { fetcher } = setup([call('unknown', {})]);
  const gateway = new OpenAiRinTextGateway(async () => 'test-api-key', 'gpt-6.1-sol', fetcher);
  await expect(
    gateway.complete({ systemPrompt: 'Rin', message: 'hello', maxTokens: 100, temperature: 1 }),
  ).rejects.toThrow('invalid_model_output');
});

test('agent request deadline aborts fetch before the longer provider timeout', async () => {
  const { model, fetcher } = setup();
  fetcher.mockImplementationOnce(
    async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('private abort details')), {
          once: true,
        });
      }),
  );
  await expect(model.generate({ ...request, timeoutMs: 5 })).rejects.toThrow('model_unavailable');
  expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});

test.each([0, -1, Number.NaN])(
  'expired/invalid request deadline %s never calls provider',
  async (timeoutMs) => {
    const { model, fetcher } = setup();
    await expect(model.generate({ ...request, timeoutMs })).rejects.toThrow('model_unavailable');
    expect(fetcher).not.toHaveBeenCalled();
  },
);

test('nullable image selection and valid Android local actions match the application contract', async () => {
  const output = {
    ...answer,
    imageName: null,
    actions: [
      {
        type: 'LOCAL_TOOL',
        tool: 'focus.start',
        payload: { minutes: 25 },
        requiresConfirmation: true,
      },
    ],
  };
  const { model } = setup([call('respond', output)]);
  expect(await model.generate(request)).toMatchObject({ type: 'final', output });
});

test('one run replays original encrypted reasoning, message phase and all batch calls', async () => {
  const reasoning = {
    type: 'reasoning',
    id: 'rs_1',
    summary: [],
    encrypted_content: 'encrypted-private',
  };
  const commentary = { ...message('Vou organizar isso.'), phase: 'commentary', id: 'msg_1' };
  const firstCall = call(tool.name, { title: 'Café' }, 'call_a');
  const secondCall = call(tool.name, { title: 'Leite' }, 'call_b');
  const deferred = call('respond', answer, 'deferred');
  const { model, fetcher } = setup([reasoning, commentary, firstCall, secondCall, deferred]);
  const results: ToolResult[] = [];
  expect((await model.generate({ ...request, results })).type).toBe('tool_calls');
  results.push(
    { callId: 'call_a', name: tool.name, input: { title: 'Café' }, output: { id: 'a' } },
    { callId: 'call_b', name: tool.name, input: { title: 'Leite' }, output: { id: 'b' } },
  );
  fetcher.mockImplementationOnce(async () => response([call('respond', answer, 'final')]));
  expect(await model.generate({ ...request, results })).toMatchObject({
    type: 'final',
    output: answer,
  });
  expect(payload(fetcher, 1).input).toEqual([
    { role: 'user', content: request.message },
    reasoning,
    commentary,
    firstCall,
    secondCall,
    deferred,
    {
      type: 'function_call_output',
      call_id: 'deferred',
      output: '{"deferred":true,"reason":"Wait for operational tool results."}',
    },
    { type: 'function_call_output', call_id: 'call_a', output: '{"id":"a"}' },
    { type: 'function_call_output', call_id: 'call_b', output: '{"id":"b"}' },
  ]);
  expect(payload(fetcher, 0).include).toEqual(['reasoning.encrypted_content']);
});

test('concurrent runs with identical prompts/messages never share encrypted reasoning', async () => {
  const { model, fetcher } = setup();
  const reasonA = { type: 'reasoning', id: 'rs_A', summary: [], encrypted_content: 'private_A' };
  const reasonB = { type: 'reasoning', id: 'rs_B', summary: [], encrypted_content: 'private_B' };
  fetcher.mockImplementationOnce(async () =>
    response([reasonA, call(tool.name, { title: 'A' }, 'call_A')]),
  );
  fetcher.mockImplementationOnce(async () =>
    response([reasonB, call(tool.name, { title: 'B' }, 'call_B')]),
  );
  const resultsA: ToolResult[] = [];
  const resultsB: ToolResult[] = [];
  await Promise.all([
    model.generate({ ...request, results: resultsA }),
    model.generate({ ...request, results: resultsB }),
  ]);
  resultsA.push({ callId: 'call_A', name: tool.name, input: { title: 'A' }, output: { id: 'A' } });
  resultsB.push({ callId: 'call_B', name: tool.name, input: { title: 'B' }, output: { id: 'B' } });
  await Promise.all([
    model.generate({ ...request, results: resultsA }),
    model.generate({ ...request, results: resultsB }),
  ]);
  expect(JSON.stringify(payload(fetcher, 2).input)).toContain('private_A');
  expect(JSON.stringify(payload(fetcher, 2).input)).not.toContain('private_B');
  expect(JSON.stringify(payload(fetcher, 3).input)).toContain('private_B');
  expect(JSON.stringify(payload(fetcher, 3).input)).not.toContain('private_A');
});

test.each(['empty', 'reorder', 'message', 'system'])(
  'invalidates continuation on mismatched %s',
  async (mutation) => {
    const { model, fetcher } = setup([
      call(tool.name, { title: 'A' }, 'call_a'),
      call(tool.name, { title: 'B' }, 'call_b'),
    ]);
    const results: ToolResult[] = [];
    await model.generate({ ...request, results });
    if (mutation !== 'empty') {
      results.push(
        { callId: 'call_a', name: tool.name, input: { title: 'A' }, output: {} },
        { callId: 'call_b', name: tool.name, input: { title: 'B' }, output: {} },
      );
    }
    if (mutation === 'reorder') results.reverse();
    await expect(
      model.generate({
        ...request,
        results,
        ...(mutation === 'message' ? { message: 'another user' } : {}),
        ...(mutation === 'system' ? { systemPrompt: 'another system' } : {}),
      }),
    ).rejects.toThrow('invalid_model_output');
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

test('invalidates continuation when a previously consumed result changes', async () => {
  const { model, fetcher } = setup([call(tool.name, { title: 'A' }, 'call_a')]);
  const results: ToolResult[] = [];
  await model.generate({ ...request, results });
  results.push({ callId: 'call_a', name: tool.name, input: { title: 'A' }, output: { id: 'A' } });
  fetcher.mockImplementationOnce(async () => response([call(tool.name, { title: 'B' }, 'call_b')]));
  await model.generate({ ...request, results });
  results[0]!.output = { id: 'altered' };
  results.push({ callId: 'call_b', name: tool.name, input: { title: 'B' }, output: {} });
  await expect(model.generate({ ...request, results })).rejects.toThrow('invalid_model_output');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('deadline bounds an unresolved credential read without making a provider request', async () => {
  const { fetcher } = setup();
  const model = new OpenAiAgentModelGateway(
    async () => new Promise<string>(() => undefined),
    'gpt-6.1-sol',
    fetcher,
  );
  await expect(model.generate({ ...request, timeoutMs: 5 })).rejects.toThrow('model_unavailable');
  expect(fetcher).not.toHaveBeenCalled();
});

test('deadline bounds an unresolved response body read after fetch headers have arrived', async () => {
  const { model, fetcher } = setup();
  const result = response([call('respond', answer)]);
  vi.spyOn(result, 'json').mockImplementation(async () => new Promise<unknown>(() => undefined));
  fetcher.mockImplementationOnce(async () => result);
  await expect(model.generate({ ...request, timeoutMs: 5 })).rejects.toThrow('model_unavailable');
  expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});
