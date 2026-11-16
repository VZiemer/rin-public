import { expect, test, vi } from 'vitest';
import { androidAvatarStates } from '../src/domain/model/contracts.js';
import { agentOutputSchema } from '../src/domain/model/validation.js';
import {
  isScheduledTestWindow,
  randomTestMessage,
  ScheduledTestPush,
} from '../src/application/use-cases/scheduled-test-push.js';
import { DynamoDbScheduledPushClaims } from '../src/adapters/outbound/dynamodb/scheduled-push-claims.js';
import type { DocumentClient } from '../src/adapters/outbound/dynamodb/store.js';
import { FirebaseNotificationGateway } from '../src/adapters/outbound/notifications/firebase.js';

test('all 13 daily slots, including weekends and 20:00, use Sao Paulo time', () => {
  for (const day of ['2026-09-14', '2026-09-19', '2026-09-20']) {
    for (let hour = 8; hour <= 20; hour++) {
      const slot = `${day}T${String(hour).padStart(2, '0')}:00:00-03:00`;
      expect(isScheduledTestWindow(slot, new Date(new Date(slot).getTime() + 30_000))).toBe(true);
    }
  }
  for (const slot of [
    '2026-09-14T07:00:00-03:00',
    '2026-09-14T21:00:00-03:00',
    '2026-09-14T08:30:00-03:00',
    '2026-09-14T08:00:01-03:00',
  ])
    expect(isScheduledTestWindow(slot, new Date(slot))).toBe(false);
  const slot = '2026-09-14T20:00:00-03:00';
  expect(isScheduledTestWindow(slot, new Date('2026-09-14T20:01:00-03:00'))).toBe(false);
  expect(
    isScheduledTestWindow('2026-09-14T08:00:00-03:00', new Date('2026-09-14T08:05:00-03:00')),
  ).toBe(false);
  expect(isScheduledTestWindow(slot, new Date('2026-09-14T19:59:00-03:00'))).toBe(false);
  expect(isScheduledTestWindow('invalid', new Date())).toBe(false);
});

test('all nine Android emotions reach the FCM data payload with compatible messages', async () => {
  const send = vi.fn().mockResolvedValue('test-id');
  const gateway = new FirebaseNotificationGateway({ send });
  for (let index = 0; index < androidAvatarStates.length; index++) {
    const payload = randomTestMessage({
      integer: (upper) => (upper === androidAvatarStates.length ? index : 0),
    });
    expect(agentOutputSchema.parse(payload).avatarState).toBe(androidAvatarStates[index]);
    expect(payload.message.length).toBeLessThan(240);
    await gateway.send('fake-token', payload);
    expect(send.mock.lastCall?.[0].data.avatarState).toBe(androidAvatarStates[index]);
  }
});

test('only one overlapping invocation sends; stale and out-of-hours calls do not claim', async () => {
  const execute = vi.fn(async () => ({ status: 'sent' as const }));
  const seen = new Set<string>();
  const claim = vi.fn(async (_u: string, _d: string, slot: string) => {
    if (seen.has(slot)) return false;
    seen.add(slot);
    return true;
  });
  const runner = new ScheduledTestPush(
    { execute },
    { claim },
    { now: () => new Date('2026-09-14T11:00:15Z') },
    { integer: () => 0 },
    'u',
    'device',
  );
  const results = await Promise.all([
    runner.execute('2026-09-14T11:00:00Z'),
    runner.execute('2026-09-14T08:00:00-03:00'),
  ]);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(results).toContainEqual({ status: 'skipped', reason: 'duplicate' });
  expect(execute).toHaveBeenCalledWith(
    'u',
    'device',
    expect.objectContaining({ avatarState: 'NEUTRAL' }),
  );

  expect(await runner.execute('2026-09-14T10:00:00Z')).toEqual({
    status: 'skipped',
    reason: 'outside_window',
  });
  expect(claim).toHaveBeenCalledTimes(2);
});

test('DynamoDB reserves the slot conditionally with TTL and does not hide infrastructure failures', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(Object.assign(new Error(), { name: 'ConditionalCheckFailedException' }))
    .mockRejectedValueOnce(new Error('unavailable'));
  const claims = new DynamoDbScheduledPushClaims({ send } as DocumentClient, 'table');
  const now = new Date('2026-09-14T11:00:00Z');
  expect(await claims.claim('u', 'device', now.toISOString(), now)).toBe(true);
  expect(send.mock.calls[0]?.[0].input).toMatchObject({
    ConditionExpression: 'attribute_not_exists(PK)',
    Item: {
      PK: 'USER#u',
      SK: 'TEST_PUSH_DELIVERY#device:2026-09-14T11:00:00.000Z',
      expiresAt: Math.floor(now.getTime() / 1000) + 172800,
    },
  });
  expect(await claims.claim('u', 'device', now.toISOString(), now)).toBe(false);
  await expect(claims.claim('u', 'device', now.toISOString(), now)).rejects.toThrow('unavailable');
});
