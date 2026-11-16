import { expect, test, vi } from 'vitest';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { InMemoryAssistantRepository } from '../src/adapters/outbound/memory/assistant-repository.js';
import { event } from './http-fixture.js';

test('selects a known assistant and rejects unknown or disabled ones', async () => {
  const execute = vi.fn(async () => ({
    message: 'ok',
    avatarState: 'NEUTRAL' as const,
    priority: 'NORMAL' as const,
    actions: [],
  }));
  const assistants = new InMemoryAssistantRepository();
  await assistants.put({
    id: 'RIN',
    name: 'Rin',
    description: 'Tsundere friend',
    defaultAvatarState: 'NEUTRAL',
    personaRef: 'rin',
    enabled: true,
  });
  await assistants.put({
    id: 'YUI',
    name: 'Yui',
    description: 'Cheerful companion',
    defaultAvatarState: 'SOFT_SMILE',
    personaRef: 'yui',
    enabled: false,
  });
  const handler = createHandler({
    environment: 'dev',
    devUserId: 'u',
    allowDevUserFallback: true,
    ids: { next: () => 'c' },
    assistants,
    agent: { execute },
  });

  const ok = await handler(event('POST', '/agent/message', { message: 'oi', assistantId: 'rin' }));
  expect(ok.statusCode).toBe(200);
  expect(JSON.parse(ok.body as string).assistantId).toBe('RIN');
  expect(execute).toHaveBeenCalledWith('u', 'oi', 'c', { deviceId: undefined, assistantId: 'RIN', turnId: 'test' });

  const missing = await handler(
    event('POST', '/agent/message', { message: 'oi', assistantId: 'NOPE' }),
  );
  expect(missing.statusCode).toBe(404);
  expect(JSON.parse(missing.body as string).code).toBe('ASSISTANT_NOT_FOUND');

  const disabled = await handler(
    event('POST', '/agent/message', { message: 'oi', assistantId: 'YUI' }),
  );
  expect(disabled.statusCode).toBe(404);
});
