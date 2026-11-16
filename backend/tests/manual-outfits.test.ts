import { expect, test, vi } from 'vitest';
import { RegisterManualRinOutfits } from '../src/application/assets/manual-outfits.js';
import { OnboardUploadedAsset } from '../src/application/assets/onboarding.js';
import { rinManualOutfits, manualRinOutfitSet } from '../src/domain/model/rin-manual-outfits.js';
import {
  rinAssetCatalogSchema,
  type RinAssetCatalog,
  type RinAssetImage,
} from '../src/domain/model/rin-assets.js';
import {
  assetOnboardingSchema,
  type AssetOnboarding,
} from '../src/domain/model/asset-onboarding.js';
import type { AssetOnboardingRepository } from '../src/application/ports/asset-onboarding.js';
import { AppError } from '../src/domain/errors/app-error.js';

const clock = { now: () => new Date('2026-10-14T20:00:00Z') };
const userId = '01900000-0000-7000-8000-000000000001';
const image = (id: string, expression: RinAssetImage['expression'] = 'NEUTRAL'): RinAssetImage => ({
  id,
  name: id,
  expression,
  objectKey: `assistants/RIN/${id}.png`,
  sha256: 'a'.repeat(64),
  contentType: 'image/png',
  sizeBytes: 100,
});
function fixture() {
  let current: RinAssetCatalog | null = rinAssetCatalogSchema.parse({
    assistantId: 'RIN',
    version: 'v1',
    publishedAt: clock.now().toISOString(),
    sets: [
      {
        id: 'NORMAL',
        name: 'Visual normal',
        useCase: 'Conversa cotidiana',
        images: [image('normal')],
      },
    ],
  });
  const catalog = {
    get: vi.fn(async () => structuredClone(current)),
    publish: vi.fn(async (next: RinAssetCatalog, expected: string | null) => {
      if ((current?.version ?? null) !== expected)
        throw new AppError('asset_catalog_version_conflict', 409);
      current = rinAssetCatalogSchema.parse(next);
    }),
  };
  const data = new Map<string, AssetOnboarding>();
  const records: AssetOnboardingRepository = {
    get: async (_user, id) => structuredClone(data.get(id) ?? null),
    listOpen: async () => [...data.values()].filter((record) => record.status !== 'completed'),
    save: vi.fn(async (record, expected) => {
      if ((data.get(record.image.id)?.revision ?? null) !== expected) return false;
      data.set(record.image.id, assetOnboardingSchema.parse(record));
      return true;
    }),
  };
  const storage = { verify: vi.fn(async () => {}), download: vi.fn() };
  let count = 0;
  const registration = new RegisterManualRinOutfits({
    catalog,
    storage,
    clock,
    ids: { next: () => String(++count) },
    onboarding: { records, userId },
  });
  return { catalog, storage, registration, records, data, current: () => current! };
}

test('registers all four approved outfits, preserves existing rules and completes pending onboarding without a preview', async () => {
  const f = fixture(),
    original = structuredClone(f.current().sets[0]);
  const images = rinManualOutfits.map((outfit) => image(outfit.id));
  const result = await f.registration.execute(images);
  expect(result).toMatchObject({
    status: 'registered',
    imageNames: images.map((entry) => entry.id),
  });
  expect(f.current().sets[0]).toEqual(original);
  for (const outfit of rinManualOutfits) {
    expect(f.current().sets.find((set) => set.id === outfit.id)).toEqual(
      manualRinOutfitSet(image(outfit.id)),
    );
    expect(f.data.get(outfit.id)).toMatchObject({
      status: 'completed',
      usage: { manualOnly: true },
    });
  }
  await f.registration.execute(images);
  await f.registration.execute([images[0]!]);
  expect(f.catalog.publish).toHaveBeenCalledTimes(1);
  expect(f.storage.download).not.toHaveBeenCalled();
});

test('a previously automatic image is moved to its own manual set without deleting unrelated poses', async () => {
  const f = fixture(),
    target = image('rin_00_rabbit', 'SMUG');
  f.current().sets[0]!.images.push(target);
  await f.registration.execute([target]);
  expect(f.current().sets[0]!.images.map((entry) => entry.id)).toEqual(['normal']);
  expect(f.current().sets[1]).toMatchObject({ id: 'rin_00_rabbit', manualOnly: true });
});

test('verification failures and reused names with different bytes never publish', async () => {
  const f = fixture();
  f.storage.verify.mockRejectedValueOnce(new Error('mismatch'));
  await expect(f.registration.execute([image('rin_00_maid')])).rejects.toThrow('mismatch');
  expect(f.catalog.publish).not.toHaveBeenCalled();
  await f.registration.execute([image('rin_00_maid')]);
  await expect(
    f.registration.execute([{ ...image('rin_00_maid'), sha256: 'b'.repeat(64) }]),
  ).rejects.toThrow('name_conflict');
  expect(f.catalog.publish).toHaveBeenCalledTimes(1);
});

test('concurrent publication retries against the fresh catalog and preserves the concurrent outfit', async () => {
  const f = fixture();
  f.catalog.publish.mockImplementationOnce(async () => {
    f.current().version = 'concurrent';
    f.current().sets.push({ ...f.current().sets[0]!, id: 'NEW', images: [image('new')] });
    throw new AppError('asset_catalog_version_conflict', 409);
  });
  await f.registration.execute([image('rin_00_nude')]);
  expect(f.current().sets.map((set) => set.id)).toEqual(['NORMAL', 'NEW', 'rin_00_nude']);
});

test('uploading an approved manual outfit registers silently, with no question or image selection', async () => {
  const f = fixture(),
    notifications = { send: vi.fn() };
  const upload = new OnboardUploadedAsset({
    userId,
    records: f.records,
    source: { inspect: vi.fn(async () => image('rin_00_nude')) },
    storage: f.storage,
    devices: { list: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn() },
    notifications,
    clock,
    manualOutfits: f.registration,
  });
  expect(await upload.execute('assistants/RIN/rin_00_nude.png')).toMatchObject({
    status: 'registered',
  });
  expect(notifications.send).not.toHaveBeenCalled();
  expect(f.storage.download).not.toHaveBeenCalled();
  expect(f.data.get('rin_00_nude')?.status).toBe('completed');
});
