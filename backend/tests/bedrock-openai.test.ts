import { createHash } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import {
  BedrockOpenAiAgentModelGateway,
  BedrockOpenAiResponsesTransport,
  type BedrockOpenAiCredentials,
} from '../src/adapters/outbound/agent-model/bedrock-openai.js';
import type { ModelRequest, ToolResult } from '../src/application/ports/model.js';

const identity = {
  accessKeyId: 'FAKE_AWS_ACCESS_KEY',
  secretAccessKey: 'FAKE_AWS_SECRET_KEY',
  sessionToken: 'FAKE_AWS_SESSION_TOKEN',
};
const credentials: BedrockOpenAiCredentials = async () => identity;
const request: ModelRequest = {
  systemPrompt: 'Rin personality',
  message: 'Bom dia, Rin.',
  tools: [
    {
      name: 'list_tasks',
      description: 'List tasks',
      risk: 'READ',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
  results: [],
};
const answer = {
  message: 'Bom dia, criatura.',
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
function response(output: unknown[] = [call('respond', answer)]) {
  return new Response(JSON.stringify({ status: 'completed', output }));
}
function setup() {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response());
  const model = new BedrockOpenAiAgentModelGateway(credentials, 'us-east-1', undefined, fetcher);
  return { fetcher, model };
}
function payload(fetcher: ReturnType<typeof vi.fn<typeof fetch>>, index = 0) {
  return JSON.parse(String(fetcher.mock.calls[index]?.[1]?.body)) as Record<string, unknown>;
}

test('AWS Responses uses signed Bedrock region/service/profile and blocks redirects', async () => {
  const { model, fetcher } = setup();
  expect(await model.generate(request)).toMatchObject({ type: 'final', output: answer });
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/responses',
  );
  const init = fetcher.mock.calls[0]?.[1];
  expect(init).toMatchObject({
    method: 'POST',
    redirect: 'error',
    signal: expect.any(AbortSignal),
  });
  const headers = new Headers(init?.headers);
  expect(headers.get('host')).toBe('bedrock-runtime.us-east-1.amazonaws.com');
  expect(headers.get('content-type')).toBe('application/json');
  expect(headers.get('x-amz-security-token')).toBe(identity.sessionToken);
  expect(headers.get('x-amz-date')).toMatch(/^\d{8}T\d{6}Z$/);
  expect(headers.get('authorization')).toMatch(
    /^AWS4-HMAC-SHA256 Credential=FAKE_AWS_ACCESS_KEY\/\d{8}\/us-east-1\/bedrock\/aws4_request, SignedHeaders=/,
  );
  expect(headers.get('authorization')).toContain('host');
  expect(headers.get('authorization')).toContain('x-amz-security-token');
  expect(headers.get('authorization')).not.toContain(identity.secretAccessKey);
  expect(headers.get('authorization')).not.toContain('Bearer');
  expect(headers.get('x-amz-content-sha256')).toBe(
    createHash('sha256').update(String(init?.body)).digest('hex'),
  );
  expect(payload(fetcher)).toMatchObject({
    model: 'us.openai.gpt-6.1-sol',
    store: false,
    reasoning: { effort: 'low' },
    tools: [
      expect.objectContaining({ strict: false }),
      expect.objectContaining({ name: 'respond' }),
    ],
  });
  expect(payload(fetcher)).not.toHaveProperty('temperature');
  expect(payload(fetcher)).not.toHaveProperty('top_p');
});

test('AWS transport uses configured profile and region, overriding caller storage/model/reasoning', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response());
  const transport = new BedrockOpenAiResponsesTransport(
    credentials,
    'us-west-2',
    'global.openai.gpt-6.1-sol',
    fetcher,
  );
  await transport.create({
    model: 'wrong',
    store: true,
    reasoning: { effort: 'none' },
    input: 'hi',
  });
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    'https://bedrock-runtime.us-west-2.amazonaws.com/openai/v1/responses',
  );
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization')).toContain(
    '/us-west-2/bedrock/aws4_request',
  );
  expect(payload(fetcher)).toMatchObject({
    model: 'global.openai.gpt-6.1-sol',
    store: false,
    reasoning: { effort: 'low' },
  });
});

test('AWS provider shares tool protocol and encrypted reasoning replay without exposing reasoning', async () => {
  const { model, fetcher } = setup();
  const reasoning = {
    type: 'reasoning',
    id: 'rs_AWS',
    summary: [],
    encrypted_content: 'PRIVATE_REASONING',
  };
  const operation = call('list_tasks', {}, 'call_tasks');
  fetcher.mockImplementationOnce(async () => response([reasoning, operation]));
  const results: ToolResult[] = [];
  expect(await model.generate({ ...request, results })).toEqual({
    type: 'tool_call',
    call: { id: 'call_tasks', name: 'list_tasks', input: {} },
  });
  results.push({ callId: 'call_tasks', name: 'list_tasks', input: {}, output: { tasks: [] } });
  const final = await model.generate({ ...request, results });
  expect(final).toMatchObject({ type: 'final', output: answer });
  expect(JSON.stringify(final)).not.toContain('PRIVATE_REASONING');
  expect(payload(fetcher, 1).input).toEqual([
    { role: 'user', content: request.message },
    reasoning,
    operation,
    { type: 'function_call_output', call_id: 'call_tasks', output: '{"tasks":[]}' },
  ]);
});

test.each([403, 429, 500])(
  'AWS HTTP %i error never exposes credentials or response body',
  async (status) => {
    const { model, fetcher } = setup();
    fetcher.mockImplementationOnce(async () => new Response(JSON.stringify(identity), { status }));
    try {
      await model.generate(request);
      expect.fail('expected sanitized error');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'model_unavailable',
        status: 502,
        message: 'model_unavailable',
      });
      expect(JSON.stringify(error)).not.toContain('FAKE_AWS');
    }
  },
);

test('AWS credential, signing/network failures and invalid bodies are sanitized', async () => {
  const { model, fetcher } = setup();
  fetcher.mockRejectedValueOnce(new Error(JSON.stringify(identity)));
  await expect(model.generate(request)).rejects.toThrow('model_unavailable');
  fetcher.mockImplementationOnce(async () => new Response('private invalid JSON'));
  await expect(model.generate(request)).rejects.toThrow('invalid_model_output');
  const failed = new BedrockOpenAiAgentModelGateway(
    async () => {
      throw new Error(JSON.stringify(identity));
    },
    'us-east-1',
    undefined,
    fetcher,
  );
  await expect(failed.generate(request)).rejects.toThrow('model_unavailable');
  const noCredentials = new BedrockOpenAiAgentModelGateway(
    async () => ({ accessKeyId: '', secretAccessKey: '' }),
    'us-east-1',
    undefined,
    fetcher,
  );
  await expect(noCredentials.generate(request)).rejects.toThrow('model_unavailable');
});

test.each(['us-east-1.evil.example', '../us-east-1', 'https://attacker.example'])(
  'rejects unsafe AWS region %s',
  (region) => {
    expect(() => new BedrockOpenAiAgentModelGateway(credentials, region)).toThrow(
      'model_unavailable',
    );
  },
);

test('remaining deadline bounds AWS credentials, fetch and response body independently', async () => {
  const { model, fetcher } = setup();
  const hangingCredentials = new BedrockOpenAiAgentModelGateway(
    async () => new Promise(() => undefined),
    'us-east-1',
    undefined,
    fetcher,
  );
  await expect(hangingCredentials.generate({ ...request, timeoutMs: 5 })).rejects.toThrow(
    'model_unavailable',
  );
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockImplementationOnce(async () => new Promise(() => undefined));
  await expect(model.generate({ ...request, timeoutMs: 5 })).rejects.toThrow('model_unavailable');
  expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  const body = response();
  vi.spyOn(body, 'json').mockImplementation(async () => new Promise(() => undefined));
  fetcher.mockImplementationOnce(async () => body);
  await expect(model.generate({ ...request, timeoutMs: 5 })).rejects.toThrow('model_unavailable');
});

test.each([0, -1, Number.NaN])(
  'rejects invalid AWS deadline %s without provider access',
  async (timeoutMs) => {
    const { model, fetcher } = setup();
    await expect(model.generate({ ...request, timeoutMs })).rejects.toThrow('model_unavailable');
    expect(fetcher).not.toHaveBeenCalled();
  },
);

test('AWS provider caps even an oversized request/config budget at eighteen seconds', async () => {
  const { fetcher } = setup();
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  try {
    const model = new BedrockOpenAiAgentModelGateway(
      credentials,
      'us-east-1',
      undefined,
      fetcher,
      60_000,
    );
    await model.generate({ ...request, timeoutMs: 60_000 });
    expect(timeout).toHaveBeenCalledWith(18_000);
  } finally {
    timeout.mockRestore();
  }
});
