import { expect, test } from 'vitest';
import { dailyAssetDraw, replaceSeasonalAssets } from '../src/domain/model/seasonal-assets.js';
import { rinAssetCatalogSchema, type RinAssetImage } from '../src/domain/model/rin-assets.js';
import { eligibleRinAssetSets, attachRinVisualAsset } from '../src/application/assets/selection.js';
const image = (id: string): RinAssetImage => ({
  id,
  name: id,
  expression: 'NEUTRAL',
  objectKey: `assistants/RIN/${'a'.repeat(64)}.png`,
  sha256: 'a'.repeat(64),
  contentType: 'image/png',
  sizeBytes: 100,
});
function catalog() {
  const base = rinAssetCatalogSchema.parse({
    assistantId: 'RIN',
    version: 'test',
    publishedAt: '2026-10-15T12:00:00Z',
    sets: [
      {
        id: 'HOLYDAY_SUNNY',
        name: 'Holiday',
        useCase: 'Old',
        rules: { dates: ['11-02'] },
        images: [image('rin_holyday')],
      },
      {
        id: 'HALLOWEEN_MORNING',
        name: 'Halloween',
        useCase: 'Old',
        images: [image('rin_halloween')],
      },
      {
        id: 'PAJAMAS',
        name: 'Pajamas',
        useCase: 'Night',
        rules: { timeWindow: { start: '22:00', end: '06:00' } },
        images: [image('rin_pajamas')],
      },
      {
        id: 'MANUAL',
        name: 'Maid',
        useCase: 'Manual',
        manualOnly: true,
        images: [image('rin_00_maid')],
      },
    ],
  });
  return {
    ...base,
    sets: replaceSeasonalAssets(
      base,
      image('rin_11_halloween'),
      image('rin_10_weekend'),
      image('rin_12_sleep'),
    ),
  };
}
test('replaces all three old identities and preserves exclusive manual outfits', () => {
  const c = catalog();
  expect(c.sets.flatMap((s) => s.images.map((i) => i.id))).toEqual([
    'rin_00_maid',
    'rin_11_halloween',
    'rin_10_weekend',
    'rin_12_sleep',
  ]);
  expect(c.sets[0]?.manualOnly).toBe(true);
});
test('Halloween is only an October morning, independent of mood, with both selected and omitted days', () => {
  const c = catalog();
  let selected = 0;
  for (let day = 1; day <= 31; day++) {
    const date = `2026-10-${String(day).padStart(2, '0')}T11:00:00Z`;
    const contains = eligibleRinAssetSets(c, new Date(date), 'America/Sao_Paulo', {
      occasion: 'morning_briefing',
      mood: 'grumpy',
    }).some((s) => s.id === 'HALLOWEEN_MORNING');
    selected += Number(contains);
    expect(contains).toBe(dailyAssetDraw('RIN', 'HALLOWEEN_MORNING', date.slice(0, 10)) < 0.5);
    expect(
      eligibleRinAssetSets(c, new Date(date), 'UTC', { occasion: 'conversation' }).some(
        (s) => s.id === 'HALLOWEEN_MORNING',
      ),
    ).toBe(false);
  }
  expect(selected).toBeGreaterThan(0);
  expect(selected).toBeLessThan(31);
  expect(
    eligibleRinAssetSets(c, new Date('2026-11-01T11:00:00Z'), 'UTC', {
      occasion: 'morning_briefing',
    }).some((s) => s.id === 'HALLOWEEN_MORNING'),
  ).toBe(false);
});
test('weekend eligibility follows the local date, never a weekday, and has a stable daily draw', () => {
  const c = catalog();
  const weekend = c.sets.find((s) => s.id === 'WEEKEND_RANDOM')!;
  weekend.rules.chance = 1;
  expect(
    eligibleRinAssetSets(c, new Date('2026-10-17T02:00:00Z'), 'America/Sao_Paulo').some(
      (s) => s.id === weekend.id,
    ),
  ).toBe(false);
  for (const day of ['17', '18'])
    expect(
      eligibleRinAssetSets(c, new Date(`2026-10-${day}T14:00:00Z`), 'America/Sao_Paulo').some(
        (s) => s.id === weekend.id,
      ),
    ).toBe(true);
  expect(
    eligibleRinAssetSets(c, new Date('2026-10-19T14:00:00Z'), 'America/Sao_Paulo').some(
      (s) => s.id === weekend.id,
    ),
  ).toBe(false);
  weekend.rules.chance = 0;
  expect(eligibleRinAssetSets(c, new Date('2026-10-17T14:00:00Z'), 'UTC')).toEqual([]);
});
test('appearance and outgoing images agree, with Halloween winning only the morning overlap', () => {
  const c = catalog();
  for (const set of c.sets) if (set.rules.chance !== undefined) set.rules.chance = 1;
  const now = new Date('2026-10-17T11:00:00Z');
  const payload = {
    assistantId: 'RIN',
    message: 'Bom dia',
    avatarState: 'NEUTRAL' as const,
    priority: 'NORMAL' as const,
    actions: [],
  };
  expect(
    attachRinVisualAsset(payload, c, now, 'UTC', { occasion: 'morning_briefing' }).imageName,
  ).toBe('rin_11_halloween');
  expect(attachRinVisualAsset(payload, c, now, 'UTC', { occasion: 'sync' }).imageName).toBe(
    'rin_10_weekend',
  );
});

test('weekday holidays and weekends are alternative calendar matches', () => {
  const c = catalog();
  const weekend = c.sets.find((set) => set.id === 'WEEKEND_RANDOM')!;
  weekend.rules.chance = 1;
  expect(
    eligibleRinAssetSets(c, new Date('2026-11-02T14:00:00Z'), 'America/Sao_Paulo').map((s) => s.id),
  ).toContain(weekend.id);
  expect(
    eligibleRinAssetSets(c, new Date('2026-11-03T14:00:00Z'), 'America/Sao_Paulo').map((s) => s.id),
  ).not.toContain(weekend.id);
  expect(
    eligibleRinAssetSets(c, new Date('2026-11-07T14:00:00Z'), 'America/Sao_Paulo').map((s) => s.id),
  ).toContain(weekend.id);
});

test('sleep replaces the remote pajamas from 22h inclusive until 06h exclusive in the user timezone', () => {
  const c = catalog();
  for (const set of c.sets) if (set.rules.chance !== undefined) set.rules.chance = 1;
  const payload = {
    assistantId: 'RIN',
    message: 'Oi',
    avatarState: 'SOFT_SMILE' as const,
    priority: 'NORMAL' as const,
    actions: [],
  };
  const selected = (date: string) =>
    attachRinVisualAsset(payload, c, new Date(date), 'UTC', { timezone: 'America/Sao_Paulo' })
      .imageName;
  expect(selected('2026-10-18T00:59:59Z')).toBe('rin_10_weekend');
  expect(selected('2026-10-18T01:00:00Z')).toBe('rin_12_sleep');
  expect(selected('2026-10-18T08:59:59Z')).toBe('rin_12_sleep');
  expect(selected('2026-10-18T09:00:00Z')).toBe('rin_10_weekend');
  expect(
    attachRinVisualAsset(
      { ...payload, assistantId: 'YUI' },
      c,
      new Date('2026-10-18T01:00:00Z'),
      'America/Sao_Paulo',
    ).imageName,
  ).toBe('');
});
