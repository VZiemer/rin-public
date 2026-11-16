import { expect, test } from 'vitest';
import { parseAssistantId } from '../src/domain/model/assistant-id.js';
import { InMemoryAssistantRepository } from '../src/adapters/outbound/memory/assistant-repository.js';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { event } from './http-fixture.js';

test('rejects invalid, disabled and stale assistant ids', async () => {
  expect(() => parseAssistantId('rin#bad')).toThrow();
  expect(() => parseAssistantId('USER1')).toThrow();
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
    agent: {
      execute: async () => ({
        message: 'ok',
        avatarState: 'NEUTRAL',
        priority: 'NORMAL',
        actions: [],
      }),
    },
  });
  expect((await handler(event('POST', '/agent/message', { message: 'oi', assistantId: 'YUI' }))).statusCode).toBe(
    404,
  );
  expect((await handler(event('POST', '/agent/message', { message: 'oi', assistantId: 'GONE' }))).statusCode).toBe(
    404,
  );
  const fallback = await handler(event('POST', '/agent/message', { message: 'oi' }));
  expect(fallback.statusCode).toBe(200);
  expect(JSON.parse(fallback.body as string).assistantId).toBe('RIN');
});
