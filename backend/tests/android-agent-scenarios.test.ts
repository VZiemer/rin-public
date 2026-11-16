import { expect, test } from 'vitest';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { event } from './http-fixture.js';
import type { AgentOutput } from '../src/domain/model/contracts.js';

const replies = new Map<string, AgentOutput>([
  [
    'Oi Rin',
    { message: 'Oi. Fala logo antes que eu mude de ideia.', avatarState: 'NEUTRAL', priority: 'NORMAL', actions: [] },
  ],
  [
    'What do I have today?',
    { message: 'Voce tem revisar staging hoje.', avatarState: 'FOCUSED', priority: 'NORMAL', actions: [] },
  ],
  [
    'Add review staging to my list',
    { message: 'Adicionado. Milagre, uma lista organizada.', avatarState: 'SMUG', priority: 'NORMAL', actions: [] },
  ],
  [
    'Remind me tomorrow at 9',
    { message: 'Amanha as 9 eu te lembro.', avatarState: 'SMUG', priority: 'NORMAL', actions: [] },
  ],
  [
    'Start a 25 minute Pomodoro',
    {
      message: 'Vinte e cinco minutos. Tente nao abrir rede social no terceiro.',
      avatarState: 'SMUG',
      priority: 'NORMAL',
      actions: [{ type: 'LOCAL_TOOL', tool: 'focus.start', payload: { minutes: 25 } }],
    },
  ],
  [
    'Set an alarm for 7 AM',
    {
      message: 'Alarme das 7. Que ideia ousada: acordar.',
      avatarState: 'FOCUSED',
      priority: 'NORMAL',
      actions: [{ type: 'LOCAL_TOOL', tool: 'device.set_alarm', payload: { hour: 7, minute: 0 } }],
    },
  ],
]);

test('validates Android conversational scenario JSON responses', async () => {
  const handler = createHandler({
    environment: 'dev',
    devUserId: 'dev-user',
    allowDevUserFallback: true,
    ids: { next: () => 'conversation-1' },
    agent: {
      execute: async (_userId, message) => {
        const reply = replies.get(message);
        if (!reply) throw new Error('missing scenario');
        return reply;
      },
    },
  });

  for (const [message, expected] of replies) {
    const response = await handler(
      event('POST', '/agent/message', { message, deviceId: 'android-test' }),
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ...expected,
      conversationId: expect.stringMatching(/^chat-[a-f0-9]{64}$/),
    });
  }
});
