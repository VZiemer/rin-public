import { expect, test, vi } from 'vitest';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DocumentClient } from '../src/adapters/outbound/dynamodb/store.js';
import { DynamoDbRinLogRepository } from '../src/adapters/outbound/dynamodb/tick-repositories.js';
import { DynamoDbProactiveMessageRepository } from '../src/adapters/outbound/dynamodb/proactive-message-repository.js';
import {
  ProactiveTick,
  type ProactiveTickDeps,
} from '../src/application/use-cases/proactive-tick.js';
import {
  AgentContextBuilder,
  type ContextRepositories,
} from '../src/application/agent/context-builder.js';
import { SystemPromptRenderer } from '../src/application/agent/prompt-renderer.js';

const now = new Date('2026-10-11T15:00:00Z');
const message = 'Leia aquele livro que eu mencionei. Finalmente algo decente.';
const thought = 'Recomendar o livro O Hobbit, de J. R. R. Tolkien.';

function fixture() {
  const items: Record<string, unknown>[] = [];
  const send = vi.fn(async (command: PutCommand | QueryCommand) => {
    if (command instanceof PutCommand) {
      items.push(command.input.Item!);
      return {};
    }
    const pk = command.input.ExpressionAttributeValues?.[':pk'];
    return {
      Items: items
        .filter((item) => item.PK === pk)
        .slice()
        .reverse(),
    };
  });
  const client = { send } as unknown as DocumentClient;
  const recent = new DynamoDbProactiveMessageRepository(client, 'data');
  const singleton = { get: async () => null, put: async () => true };
  const owned = { userId: 'u', createdAt: now.toISOString(), updatedAt: now.toISOString() };
  const deps: ProactiveTickDeps = {
    rinState: {
      ...singleton,
      get: async () => ({ ...owned, mood: {}, currentThoughts: [thought] }),
    },
    rinPreferences: singleton,
    rinWorldContext: singleton,
    persona: singleton,
    profile: singleton,
    relationship: singleton,
    rinEpisodes: { ...singleton, list: async () => [] },
    devices: {
      get: async () => null,
      list: async () => [
        { ...owned, id: 'd', platform: 'android', enabled: true, pushToken: 'token' },
      ],
      put: async () => {},
      delete: async () => {},
    },
    workingMemory: { get: async () => null, put: async () => {}, lastActivityAt: async () => null },
    initiative: { saveInitiative: async () => {} },
    text: { complete: async () => message },
    notifications: { send: vi.fn(async () => ({ status: 'sent' as const })) },
    logs: new DynamoDbRinLogRepository(client, 'data'),
    random: { next: () => 0 },
    clock: { now: () => now },
    config: {
      timezone: 'America/Sao_Paulo',
      minCooldownMinutes: 180,
      maxMessagesPerDay: 3,
      baseChance: 0.1,
      quietHoursStart: '23:30',
      quietHoursEnd: '08:00',
    },
    userId: 'u',
  };
  const repos: ContextRepositories = {
    persona: {
      ...singleton,
      get: async () => ({ ...owned, name: 'Rin', traits: {}, core: [], behavior: {} }),
    },
    profile: singleton,
    relationship: singleton,
    routine: singleton,
    people: { ...singleton, list: async () => [] },
    proactiveMessages: recent,
  };
  const builder = new AgentContextBuilder(repos, {
    get: async () => ({ currentTime: now.toISOString(), timezone: 'America/Sao_Paulo' }),
  });
  return { deps, recent, builder, items, send };
}

test('delivered spontaneous message and recommendation details reach Rin in a new conversation', async () => {
  const f = fixture();
  expect((await new ProactiveTick(f.deps).execute({ force: true })).decision).toBe('SENT');
  const context = await f.builder.build('u', 'new-conversation-after-push', 'RIN');
  expect(context.workingMemory).toBeNull();
  expect(context.recentProactiveMessages).toEqual([
    {
      message,
      sentAt: now.toISOString(),
      topic: 'casual',
      opportunity: expect.objectContaining({ data: { thought } }),
    },
  ]);
  const prompt = new SystemPromptRenderer().render(context);
  expect(prompt).toContain(message);
  expect(prompt).toContain('O Hobbit');
  expect(prompt).toContain('qual livro?');
  const query = f.send.mock.calls.find(([command]) => command instanceof QueryCommand)?.[0];
  expect(query?.input).toMatchObject({
    ScanIndexForward: false,
    ConsistentRead: true,
    Limit: 5,
    ExpressionAttributeValues: { ':pk': 'USER#u', ':prefix': 'RIN_PROACTIVE_LOG#' },
  });
  expect((await f.builder.build('other-user', 'c', 'RIN')).recentProactiveMessages).toEqual([]);
  f.send.mockClear();
  expect((await f.builder.build('u', 'c', 'YUI')).recentProactiveMessages).toEqual([]);
  expect(f.send).not.toHaveBeenCalled();
});

test('failed delivery, dry run and missing devices never become sent-message memories', async () => {
  for (const scenario of ['failed', 'dryRun', 'noDevices']) {
    const f = fixture();
    if (scenario === 'failed') f.deps.notifications.send = async () => ({ status: 'failed' });
    if (scenario === 'noDevices') f.deps.devices.list = async () => [];
    await new ProactiveTick(f.deps).execute({ force: true, dryRun: scenario === 'dryRun' });
    expect(await f.recent.listRecent('u', 5)).toEqual([]);
    expect(f.items).toEqual([]);
  }
});

test('reads previous delivery logs without opportunity details, most recent first', async () => {
  const f = fixture();
  f.items.push(
    { PK: 'USER#u', message: 'Mensagem antiga', createdAt: '2026-10-10T15:00:00Z' },
    { PK: 'USER#u', message, createdAt: now.toISOString(), topic: 'books' },
  );
  expect((await f.recent.listRecent('u', 5)).map((entry) => entry.message)).toEqual([
    message,
    'Mensagem antiga',
  ]);
});
