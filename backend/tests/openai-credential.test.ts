import { afterEach, expect, test, vi } from 'vitest';
import { GetSecretValueCommand, type SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { openAiCredential } from '../src/bootstrap/openai-credential.js';

afterEach(() => vi.restoreAllMocks());

function client(secret?: string) {
  const send = vi.fn().mockResolvedValue({ SecretString: secret });
  return { send, client: { send } as Pick<SecretsManagerClient, 'send'> };
}

test('credential resolver rejects missing configuration and trims a local key without AWS calls', async () => {
  const mock = client();
  expect(() => openAiCredential('us-east-1', undefined, undefined, mock.client)).toThrow(
    'not configured',
  );
  const resolve = openAiCredential('us-east-1', undefined, '  local-test-key  ', mock.client);
  expect(await resolve()).toBe('local-test-key');
  expect(mock.send).not.toHaveBeenCalled();
});

test.each(['  secret-test-key  ', '{"apiKey":"  secret-test-key  "}'])(
  'credential resolver supports plain and JSON AWS secrets',
  async (secret) => {
    const mock = client(secret);
    const resolve = openAiCredential(
      'us-east-1',
      'arn:aws:secretsmanager:example',
      'local-unused',
      mock.client,
    );
    expect(await resolve()).toBe('secret-test-key');
    const [command, options] = mock.send.mock.calls[0] ?? [];
    expect(command).toBeInstanceOf(GetSecretValueCommand);
    expect(command.input.SecretId).toBe('arn:aws:secretsmanager:example');
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
  },
);

test('warm resolver caches a secret for 60 seconds then picks up rotation', async () => {
  let now = 10_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const mock = client('first-test-key');
  const resolve = openAiCredential('us-east-1', 'arn:test', undefined, mock.client);
  expect(await resolve()).toBe('first-test-key');
  mock.send.mockResolvedValue({ SecretString: '{"apiKey":"rotated-test-key"}' });
  now += 59_999;
  expect(await resolve()).toBe('first-test-key');
  expect(mock.send).toHaveBeenCalledTimes(1);
  now += 1;
  expect(await resolve()).toBe('rotated-test-key');
  expect(mock.send).toHaveBeenCalledTimes(2);
});

test.each([undefined, '', '{}', '{broken', '{"apiKey":123}', 'bad key', '{"apiKey":"bad key"}'])(
  'bad secret is rejected without leaking its value: %s',
  async (secret) => {
    const mock = client(secret);
    await expect(
      openAiCredential('us-east-1', 'arn:test', undefined, mock.client)(),
    ).rejects.toThrow('OpenAI credential unavailable');
  },
);

test('provider failures are sanitized and do not poison the credential cache', async () => {
  const mock = client();
  mock.send.mockRejectedValueOnce(new Error('provider error with secret-value-must-not-leak'));
  const resolve = openAiCredential('us-east-1', 'arn:test', undefined, mock.client);
  await expect(resolve()).rejects.toThrow(/^OpenAI credential unavailable$/);
  mock.send.mockResolvedValue({ SecretString: 'retry-test-key' });
  expect(await resolve()).toBe('retry-test-key');
});
