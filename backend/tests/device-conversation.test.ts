import { expect, test, vi } from 'vitest';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { event } from './http-fixture.js';
import type { AgentOutput } from '../src/domain/model/contracts.js';

function fixture(userId = 'u') {
  const execute = vi
    .fn<
      (
        userId: string,
        message: string,
        conversationId: string,
        options?: unknown,
      ) => Promise<AgentOutput>
    >()
    .mockResolvedValue({
      message: 'ok',
      avatarState: 'NEUTRAL' as const,
      priority: 'NORMAL' as const,
      actions: [],
    });
  const next = vi.fn(() => 'new-conversation');
  const handler = createHandler({
    environment: 'dev',
    devUserId: userId,
    allowDevUserFallback: true,
    ids: { next },
    agent: { execute },
  });
  return { handler, execute, next };
}

async function send(handler: ReturnType<typeof createHandler>, input: Record<string, unknown>) {
  const result = await handler(event('POST', '/agent/message', input));
  expect(result.statusCode).toBe(200);
  return JSON.parse(result.body) as { conversationId: string };
}

test('legacy Android device messages reuse a conversation across turns and handler restarts', async () => {
  const first = fixture();
  const a = await send(first.handler, { message: 'Me recomenda um mangá.', deviceId: 'phone-1' });
  const b = await send(first.handler, {
    message: 'Por que esse?',
    deviceId: 'phone-1',
    assistantId: 'rin',
  });
  const restarted = fixture();
  const c = await send(restarted.handler, {
    message: 'Qual era o nome?',
    deviceId: 'phone-1',
    assistantId: 'RIN',
  });
  expect(a.conversationId).toMatch(/^chat-[a-f0-9]{64}$/);
  expect(b.conversationId).toBe(a.conversationId);
  expect(c.conversationId).toBe(a.conversationId);
  expect(first.next).not.toHaveBeenCalled();
  expect(first.execute.mock.calls.map((call) => call[2])).toEqual([
    a.conversationId,
    a.conversationId,
  ]);
});

test('automatic device chats remain separate for owners, assistants and devices', async () => {
  const user = fixture();
  const a = await send(user.handler, { message: 'Oi.', deviceId: 'phone-1', assistantId: 'RIN' });
  const b = await send(user.handler, { message: 'Oi.', deviceId: 'phone-2', assistantId: 'RIN' });
  const c = await send(user.handler, { message: 'Oi.', deviceId: 'phone-1', assistantId: 'YUI' });
  const other = fixture('other-user');
  const d = await send(other.handler, { message: 'Oi.', deviceId: 'phone-1', assistantId: 'RIN' });
  expect(
    new Set([a.conversationId, b.conversationId, c.conversationId, d.conversationId]).size,
  ).toBe(4);
});

test('explicit new chats take priority and requests without a device keep the original API behavior', async () => {
  const { handler, next } = fixture();
  expect(
    (await send(handler, { message: 'Oi.', deviceId: 'phone-1', conversationId: 'separate-chat' }))
      .conversationId,
  ).toBe('separate-chat');
  expect((await send(handler, { message: 'Oi.' })).conversationId).toBe('new-conversation');
  expect(next).toHaveBeenCalledTimes(1);
});
