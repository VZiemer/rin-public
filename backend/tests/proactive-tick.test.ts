import { expect, test, vi } from 'vitest';
import type { Device, RinLiveState } from '../src/domain/model/contracts.js';
import { ProactiveTick, type ProactiveTickDeps } from '../src/application/use-cases/proactive-tick.js';
import type { ProactiveConfig } from '../src/application/use-cases/proactive-logic.js';

const config: ProactiveConfig = {
  timezone: 'America/Sao_Paulo',
  minCooldownMinutes: 180,
  maxMessagesPerDay: 3,
  baseChance: 0.1,
  quietHoursStart: '23:30',
  quietHoursEnd: '08:00',
};
const noonUtc = new Date('2026-01-02T15:00:00Z'); // 12:00 local
const device: Device = {
  userId: 'u',
  createdAt: 'now',
  updatedAt: 'now',
  id: 'd1',
  platform: 'android',
  pushToken: 'tok',
  enabled: true,
};
const singleton = { get: async () => null, put: async () => true };
const state: RinLiveState = {
  userId: 'u',
  createdAt: 'now',
  updatedAt: 'now',
  mood: {},
  currentThoughts: ['pensando num mangá novo'],
};

function deps(overrides: Partial<ProactiveTickDeps> = {}): ProactiveTickDeps {
  return {
    rinState: { get: async () => state, put: async () => true },
    rinPreferences: singleton,
    rinWorldContext: singleton,
    persona: singleton,
    profile: singleton,
    relationship: singleton,
    rinEpisodes: { get: async () => null, list: async () => [], put: async () => true },
    devices: { get: async () => null, list: async () => [device], put: vi.fn(), delete: async () => {} },
    workingMemory: { get: async () => null, put: async () => {}, lastActivityAt: async () => null },
    initiative: { saveInitiative: vi.fn(async () => {}) },
    text: { complete: vi.fn(async () => 'Tá acordado? Achei um mangá decente.') },
    notifications: { send: vi.fn(async () => ({ status: 'simulated' as const })) },
    logs: { append: vi.fn(async () => {}) },
    random: { next: () => 0 },
    clock: { now: () => noonUtc },
    config,
    userId: 'u',
    ...overrides,
  };
}

test('proactive tick sends when forced, persists initiative and logs', async () => {
  const d = deps();
  const result = await new ProactiveTick(d).execute({ force: true });
  expect(result.decision).toBe('SENT');
  expect((result.payload as { message: string }).message).toBe('Tá acordado? Achei um mangá decente.');
  expect(d.initiative.saveInitiative).toHaveBeenCalledTimes(1);
  expect(d.logs.append).toHaveBeenCalledWith('RIN_PROACTIVE_LOG', 'u', expect.any(Object), noonUtc);
});

test('proactive tick respects quiet hours', async () => {
  const quiet = new Date('2026-01-02T03:00:00Z'); // 00:00 local
  const result = await new ProactiveTick(deps({ clock: { now: () => quiet } })).execute({});
  expect(result.decision).toBe('SILENT');
  expect(result.reason).toBe('quiet_hours');
});

test('proactive tick dry run does not deliver or persist', async () => {
  const d = deps();
  const result = await new ProactiveTick(d).execute({ force: true, dryRun: true });
  expect(result.decision).toBe('WOULD_SEND');
  expect(d.notifications.send).not.toHaveBeenCalled();
  expect(d.initiative.saveInitiative).not.toHaveBeenCalled();
});

test('proactive tick is silent when no device is enabled', async () => {
  const d = deps({
    devices: { get: async () => null, list: async () => [], put: vi.fn(), delete: async () => {} },
  });
  const result = await new ProactiveTick(d).execute({ force: true });
  expect(result.decision).toBe('SILENT');
  expect(result.reason).toBe('no_enabled_device');
});
