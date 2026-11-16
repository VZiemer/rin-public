import { expect, test, vi } from 'vitest';
import { cleanAgentOutputForHttp, createHandler } from '../src/adapters/inbound/http/handler.js';
import { event } from './http-fixture.js';
import { Tasks } from '../src/application/use-cases/tasks.js';
import { Reminders } from '../src/application/use-cases/reminders.js';
import type { Reminder, Task } from '../src/domain/model/contracts.js';
test('strips model protocol markup from HTTP agent output', () => {
  expect(
    cleanAgentOutputForHttp({
      message:
        '<thinking>plan</thinking><response>{"message":"Oi","avatarState":"SMUG"}</response>',
      avatarState: 'NEUTRAL',
      priority: 'NORMAL',
      actions: [],
    }),
  ).toMatchObject({ message: 'Oi', avatarState: 'SMUG' });
  expect(
    cleanAgentOutputForHttp({
      message: 'Responding to the user directly. Olha so.',
      avatarState: 'NEUTRAL',
      priority: 'NORMAL',
      actions: [],
    }),
  ).toMatchObject({ message: 'Olha so.' });
});
test('GET tasks and reminders hide closed items', async () => {
  const tasks: Task[] = [
    {
      id: 'open',
      userId: 'u',
      title: 'aberta',
      status: 'pending',
      createdAt: 'now',
      updatedAt: 'now',
    },
    {
      id: 'done',
      userId: 'u',
      title: 'feita',
      status: 'completed',
      createdAt: 'now',
      updatedAt: 'now',
    },
  ];
  const reminders: Reminder[] = [
    {
      id: 'active',
      userId: 'u',
      title: 'ativa',
      status: 'active',
      createdAt: 'now',
      updatedAt: 'now',
    },
    {
      id: 'closed',
      userId: 'u',
      title: 'fechada',
      status: 'completed',
      createdAt: 'now',
      updatedAt: 'now',
    },
  ];
  const clock = { now: () => new Date('2026-09-14T12:00:00.000Z') };
  const handler = createHandler({
    environment: 'dev',
    devUserId: 'u',
    allowDevUserFallback: true,
    ids: { next: () => 'c' },
    agent: { execute: vi.fn() },
    tasks: new Tasks(
      {
        get: async () => null,
        list: async () => tasks,
        create: async () => {},
        update: async () => true,
      },
      clock,
      { next: () => 't' },
    ),
    reminders: new Reminders(
      {
        get: async () => null,
        list: async () => reminders,
        create: async () => {},
        update: async () => true,
        updateNotificationState: async () => {},
      },
      clock,
      { next: () => 'r' },
    ),
  });
  expect(JSON.parse((await handler(event('GET', '/tasks'))).body).items).toEqual([
    expect.objectContaining({ id: 'open' }),
  ]);
  expect(JSON.parse((await handler(event('GET', '/reminders'))).body).items).toEqual([
    expect.objectContaining({ id: 'active' }),
  ]);
});

test('extracts a social support reply from provider XML without importing embedded actions', () => {
  const original = {
    message:
      '<div slot="response">\n<message>Ei. O que aconteceu? Quer conversar?</message>\n<avatarState>SOFT_SMILE</avatarState>\n<priority>HIGH</priority>\n<actions>[{"type":"LOCAL_TOOL","tool":"device.open_alarms"}]</actions>\n</div>',
    avatarState: 'NEUTRAL',
    priority: 'NORMAL',
    actions: [],
  };
  expect(cleanAgentOutputForHttp(original)).toEqual({
    ...original,
    message: 'Ei. O que aconteceu? Quer conversar?',
  });
  expect(cleanAgentOutputForHttp({ message: 'Como funciona a tag <message>?' })).toEqual({
    message: 'Como funciona a tag <message>?',
  });
});
