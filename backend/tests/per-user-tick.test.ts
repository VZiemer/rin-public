import { expect, test, vi } from 'vitest';
import { runPerUserTick } from '../src/application/use-cases/per-user-tick.js';
import { DynamoDbTickUserSource } from '../src/adapters/outbound/dynamodb/tick-repositories.js';

test('runs the tick once per user and isolates failures', async () => {
  const run = vi.fn(async (userId: string) => {
    if (userId === 'broken') throw new Error('boom');
    return { decision: userId === 'a' ? 'SENT' : 'SILENT', reason: 'nothing_due' };
  });
  const summary = await runPerUserTick({
    name: 'reminder_tick',
    users: { listUserIdsWithDevices: async () => ['a', 'broken', 'b'] },
    run,
  });
  expect(run.mock.calls.map(([id]) => id).sort()).toEqual(['a', 'b', 'broken']);
  expect(summary).toMatchObject({ users: 3, sent: 1, failed: 1 });
  expect(summary.results.find((r) => r.userId === 'broken')).toEqual({
    userId: 'broken',
    decision: 'FAILED',
    reason: 'error',
  });
});

test('does nothing when no user owns an enabled device', async () => {
  const run = vi.fn();
  const summary = await runPerUserTick({
    name: 'proactive_tick',
    users: { listUserIdsWithDevices: async () => [] },
    run,
  });
  expect(run).not.toHaveBeenCalled();
  expect(summary).toMatchObject({ users: 0, sent: 0, failed: 0 });
});

test('user source pages through enabled device ownership and dedupes owners', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({
      Items: [{ ownerUserId: 'u1' }, { ownerUserId: 'u2' }, { ownerUserId: 'bad#key' }],
      LastEvaluatedKey: { PK: 'x' },
    })
    .mockResolvedValueOnce({ Items: [{ ownerUserId: 'u1' }, {}] });
  const source = new DynamoDbTickUserSource({ send } as never, 'table');
  expect((await source.listUserIdsWithDevices()).sort()).toEqual(['u1', 'u2']);
  expect(send).toHaveBeenCalledTimes(2);
  const firstInput = send.mock.calls[0]![0].input;
  expect(firstInput.ExpressionAttributeValues).toEqual({ ':type': 'DEVICE_OWNERSHIP', ':enabled': true });
  expect(send.mock.calls[1]![0].input.ExclusiveStartKey).toEqual({ PK: 'x' });
});
