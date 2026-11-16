import { expect, test, vi } from 'vitest';
import { ConfirmationPolicy, Confirmations } from '../src/application/agent/confirmation.js';
import {
  AgentToolRegistry,
  AgentToolExecutor,
  defineTool,
} from '../src/application/agent/tools.js';
import type { PendingConfirmation } from '../src/domain/model/contracts.js';
import { z } from 'zod';
test('policy never requests confirmation while the UI is disabled', () => {
  const policy = new ConfirmationPolicy(new Set(['create_reminder', 'send_email']));
  expect(policy.requiresConfirmation('read', 'READ')).toBe(false);
  expect(policy.requiresConfirmation('write', 'WRITE')).toBe(false);
  expect(policy.requiresConfirmation('create_reminder', 'WRITE')).toBe(false);
  expect(policy.requiresConfirmation('send_email', 'SENSITIVE')).toBe(false);
});
test('approval executes stored arguments once and rejects replay or other users', async () => {
  let record: PendingConfirmation | null = null;
  const execute = vi.fn(async () => 'done');
  const executor = new AgentToolExecutor(
    new AgentToolRegistry([
      defineTool({
        name: 'write',
        description: 'write',
        risk: 'WRITE',
        inputSchema: z.object({}).strict(),
        execute,
      }),
    ]),
  );
  const service = new Confirmations(
    {
      create: async (v) => {
        record = v;
      },
      get: async (u) => (record?.userId === u ? record : null),
      transition: async (u, id, from, to) => {
        if (!record || record.status !== from) return false;
        record.status = to;
        return true;
      },
    },
    { now: () => new Date('2026-01-01T00:00:00Z') },
    { next: () => 'id' },
    executor,
  );
  await service.request(
    { id: 'call', name: 'write', input: {} },
    { userId: 'u', conversationId: 'c' },
  );
  await expect(service.decide('other', 'id', true)).rejects.toThrow('not_found');
  expect(await service.decide('u', 'id', true)).toMatchObject({ status: 'approved' });
  await expect(service.decide('u', 'id', true)).rejects.toThrow('unavailable');
  expect(execute).toHaveBeenCalledTimes(1);
});
