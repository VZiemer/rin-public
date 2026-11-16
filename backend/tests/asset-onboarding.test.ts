import { expect, test, vi } from 'vitest';
import { AssetContextChat, OnboardUploadedAsset } from '../src/application/assets/onboarding.js';
import type { AssetOnboardingRepository } from '../src/application/ports/asset-onboarding.js';
import type { AssetOnboarding } from '../src/domain/model/asset-onboarding.js';
import { assetOnboardingSchema } from '../src/domain/model/asset-onboarding.js';
import { rinAssetCatalogSchema, type RinAssetCatalog } from '../src/domain/model/rin-assets.js';
import { AppError } from '../src/domain/errors/app-error.js';
import { RunAgent } from '../src/application/use-cases/run-agent.js';

const userId = '01900000-0000-7000-8000-000000000001';
const otherUser = '01900000-0000-7000-8000-000000000002';
const clock = { now: () => new Date('2026-10-14T18:00:00Z') };
const image = {
  id: 'rin_new',
  name: 'rin_new',
  expression: 'NEUTRAL' as const,
  objectKey: `assistants/RIN/${'a'.repeat(64)}.png`,
  sha256: 'a'.repeat(64),
  contentType: 'image/png' as const,
  sizeBytes: 100,
};
const usage = {
  useCase: 'Pijama nas conversas noturnas.',
  priority: 200,
  expression: 'TIRED' as const,
  rules: { timeWindow: { start: '22:00', end: '06:00' } },
};
function fixture() {
  const data = new Map<string, AssetOnboarding>();
  const records: AssetOnboardingRepository = {
    get: async (_u, id) => structuredClone(data.get(id) ?? null),
    listOpen: async () =>
      [...data.values()].filter((r) => r.status !== 'completed').map((r) => structuredClone(r)),
    save: vi.fn(async (record, revision) => {
      if ((data.get(record.image.id)?.revision ?? null) !== revision) return false;
      data.set(record.image.id, structuredClone(assetOnboardingSchema.parse(record)));
      return true;
    }),
  };
  const device = {
    id: 'android',
    userId,
    platform: 'android' as const,
    pushToken: 'private-token',
    enabled: true,
    createdAt: clock.now().toISOString(),
    updatedAt: clock.now().toISOString(),
  };
  const devices = {
    get: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    list: vi.fn(async () => [device]),
    getOwnership: vi.fn(async () => ({ ...device, deviceId: device.id, ownerUserId: userId })),
  };
  const notifications = { send: vi.fn(async () => ({ status: 'sent' as const })) };
  const storage = {
    verify: vi.fn(async () => {}),
    download: vi.fn(async () => ({
      url: 'https://example.com/private',
      expiresAt: clock.now().toISOString(),
    })),
  };
  const source = { inspect: vi.fn(async () => image) };
  let current: RinAssetCatalog | null = null;
  const catalog = {
    get: vi.fn(async () => current),
    publish: vi.fn(async (value: RinAssetCatalog, expected: string | null) => {
      if ((current?.version ?? null) !== expected)
        throw new AppError('asset_catalog_version_conflict', 409);
      current = rinAssetCatalogSchema.parse(value);
    }),
  };
  const analyzer = { analyze: vi.fn(async () => ({ status: 'understood' as const, usage })) };
  const upload = new OnboardUploadedAsset({
    userId,
    records,
    source,
    storage,
    devices,
    notifications,
    clock,
  });
  const chat = new AssetContextChat({
    userId,
    records,
    analyzer,
    catalog,
    storage,
    clock,
    ids: { next: () => 'version' },
  });
  const pending = (id = image.id): AssetOnboarding => ({
    userId,
    assistantId: 'RIN',
    image: { ...image, id },
    status: 'pending',
    revision: 0,
    createdAt: clock.now().toISOString(),
    updatedAt: clock.now().toISOString(),
    deliveredDevices: [],
    turns: [],
  });
  return {
    data,
    records,
    devices,
    notifications,
    source,
    storage,
    catalog,
    analyzer,
    upload,
    chat,
    pending,
  };
}

test('legacy pending manual outfits never activate an image while asking for clarification', async () => {
  const f = fixture();
  f.data.set('rin_00_nude', f.pending('rin_00_nude'));
  f.analyzer.analyze.mockRejectedValueOnce(new Error('unavailable'));
  const output = await f.chat.handle(userId, 'RIN', 'rin_00_nude somente manual');
  expect(output?.message).toContain('I could not interpret');
  expect(output).not.toHaveProperty('imageName');
  expect(output?.actions).toEqual([]);
});

test('upload sends download and question only to a currently owned developer device; duplicates are suppressed', async () => {
  const f = fixture();
  await f.upload.execute(image.objectKey);
  await f.upload.execute(image.objectKey);
  expect(f.devices.list).toHaveBeenCalledWith(userId, 200);
  expect(f.notifications.send).toHaveBeenCalledTimes(2);
  expect(f.notifications.send.mock.calls[0]).toEqual([
    'private-token',
    expect.objectContaining({
      type: 'avatar_image_available',
      imageName: image.id,
      imageSha256: image.sha256,
    }),
  ]);
  expect(f.notifications.send.mock.calls[1]).toEqual([
    'private-token',
    expect.objectContaining({ message: expect.stringContaining(image.id), imageName: image.id }),
  ]);
  expect(f.data.get(image.id)?.status).toBe('pending');
});

test('transferred device receives neither image nor question', async () => {
  const f = fixture();
  f.devices.getOwnership.mockImplementation(async () => ({
    ...(await fixture().devices.getOwnership()),
    ownerUserId: otherUser,
  }));
  await expect(f.upload.execute(image.objectKey)).rejects.toThrow('No eligible developer device');
  expect(f.notifications.send).not.toHaveBeenCalled();
  expect(f.data.has(image.id)).toBe(true);
});

test('failure after availability can be retried without losing the pending image', async () => {
  const f = fixture();
  f.notifications.send.mockRejectedValueOnce(new Error('FCM offline'));
  await expect(f.upload.execute(image.objectKey)).rejects.toThrow('FCM offline');
  expect(f.data.get(image.id)?.deliveredDevices).toEqual([]);
  await f.upload.execute(image.objectKey);
  expect(f.data.get(image.id)?.deliveredDevices).toHaveLength(1);
});

test('same image name cannot identify different bytes', async () => {
  const f = fixture();
  f.data.set(image.id, { ...f.pending(), image: { ...image, sha256: 'b'.repeat(64) } });
  await expect(f.upload.execute(image.objectKey)).rejects.toThrow('asset_image_name_conflict');
  expect(f.notifications.send).not.toHaveBeenCalled();
});

test('registering the same token again does not repeat the question', async () => {
  const f = fixture();
  await f.upload.execute(image.objectKey);
  const device = (await f.devices.list())[0]!;
  f.devices.list.mockResolvedValue([{ ...device, updatedAt: '2026-10-14T19:00:00Z' }]);
  await f.upload.execute(image.objectKey);
  expect(f.notifications.send).toHaveBeenCalledTimes(2);
});

test('chat ignores other users and assistants', async () => {
  const f = fixture();
  f.data.set(image.id, f.pending());
  expect(await f.chat.handle(otherUser, 'RIN', '22h às 6h')).toBeNull();
  expect(await f.chat.handle(userId, 'YUI', '22h às 6h')).toBeNull();
  expect(f.analyzer.analyze).not.toHaveBeenCalled();
});

test('ambiguous response asks again and persists the clarification across conversations', async () => {
  const f = fixture();
  f.data.set(image.id, f.pending());
  f.analyzer.analyze.mockResolvedValueOnce({
    status: 'clarify',
    question: 'Qual horário define a noite?',
  } as never);
  expect((await f.chat.handle(userId, 'RIN', 'à noite'))?.message).toContain('Qual horário');
  expect(f.catalog.publish).not.toHaveBeenCalled();
  expect(f.data.get(image.id)?.turns).toEqual([
    { answer: 'à noite', question: 'Qual horário define a noite?' },
  ]);
  const output = await f.chat.handle(userId, 'RIN', 'Das 22h às 6h, prioridade 200');
  expect(output?.message).toContain('I saved');
  expect(f.catalog.publish.mock.calls[0]?.[0].sets[0]).toMatchObject({
    useCase: usage.useCase,
    rules: usage.rules,
    priority: 200,
    images: [{ expression: 'TIRED' }],
  });
  expect(f.data.get(image.id)?.status).toBe('completed');
});

test('unrelated chat and invalid model output never publish rules', async () => {
  const f = fixture();
  f.data.set(image.id, f.pending());
  f.analyzer.analyze.mockResolvedValueOnce({ status: 'unrelated' } as never);
  expect(await f.chat.handle(userId, 'RIN', 'bom dia')).toBeNull();
  f.analyzer.analyze.mockResolvedValueOnce({
    status: 'understood',
    usage: { ...usage, rules: { command: 'delete' } },
  } as never);
  expect((await f.chat.handle(userId, 'RIN', 'use sempre'))?.message).toContain(
    'I could not interpret',
  );
  expect(f.catalog.publish).not.toHaveBeenCalled();
});

test('multiple uploads require an explicit image name', async () => {
  const f = fixture();
  f.data.set(image.id, f.pending());
  f.data.set('rin_other', f.pending('rin_other'));
  expect((await f.chat.handle(userId, 'RIN', 'use à noite'))?.message).toContain('Include the image name');
  expect(f.analyzer.analyze).not.toHaveBeenCalled();
  await f.chat.handle(userId, 'RIN', `${image.id}: 22h às 6h`);
  expect(f.data.get(image.id)?.status).toBe('completed');
  expect(f.data.get('rin_other')?.status).toBe('pending');
});

test('catalog append preserves earlier sets and retries a concurrent publication', async () => {
  const f = fixture();
  f.data.set(image.id, f.pending());
  const previous = rinAssetCatalogSchema.parse({
    assistantId: 'RIN',
    version: 'prior',
    publishedAt: clock.now().toISOString(),
    sets: [{ id: 'old', name: 'old', useCase: 'old context', images: [{ ...image, id: 'old' }] }],
  });
  f.catalog.get.mockResolvedValue(previous);
  f.catalog.publish.mockRejectedValueOnce(new AppError('asset_catalog_version_conflict', 409));
  // Model a successful second CAS without changing the mocked current pointer.
  f.catalog.publish.mockResolvedValueOnce(undefined);
  await f.chat.handle(userId, 'RIN', '22h às 6h');
  expect(f.catalog.publish).toHaveBeenCalledTimes(2);
  expect(f.catalog.publish.mock.calls[1]?.[0].sets[0]).toEqual(previous.sets[0]);
});

test('publication is recoverable after catalog commit but before pending completion', async () => {
  const f = fixture();
  f.data.set(image.id, { ...f.pending(), status: 'ready', usage });
  const original = f.records.save;
  let fail = true;
  f.records.save = async (record, revision) => {
    if (record.status === 'completed' && fail) {
      fail = false;
      throw new Error('network');
    }
    return original(record, revision);
  };
  await expect(f.chat.handle(userId, 'RIN', 'ok')).rejects.toThrow('network');
  expect((await f.chat.handle(userId, 'RIN', 'ok'))?.message).toContain('I saved');
  expect(f.catalog.publish).toHaveBeenCalledTimes(1);
});

test('manual catalogue rules cannot be silently overwritten', async () => {
  const f = fixture();
  f.data.set(image.id, f.pending());
  f.catalog.get.mockResolvedValue(
    rinAssetCatalogSchema.parse({
      assistantId: 'RIN',
      version: 'manual',
      publishedAt: clock.now().toISOString(),
      sets: [{ id: 'manual', name: 'manual', useCase: 'manually set', images: [image] }],
    }),
  );
  await expect(f.chat.handle(userId, 'RIN', '22h às 6h')).rejects.toThrow(
    'asset_already_catalogued',
  );
  expect(f.catalog.publish).not.toHaveBeenCalled();
});

test('RunAgent routes developer image replies before normal skills and remembers the reply', async () => {
  const f = fixture();
  f.data.set(image.id, f.pending());
  const remember = { execute: vi.fn() };
  const builder = { build: vi.fn() };
  const agent = new RunAgent(
    builder as never,
    {} as never,
    {} as never,
    remember as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    f.chat,
  );
  expect(
    (await agent.execute(userId, '22h às 6h', 'app-conversation', { assistantId: 'RIN' })).message,
  ).toContain('I saved');
  expect(builder.build).not.toHaveBeenCalled();
  expect(remember.execute).toHaveBeenCalledWith(
    userId,
    'app-conversation',
    '22h às 6h',
    expect.stringContaining('I saved'),
    'RIN',
  );
});
