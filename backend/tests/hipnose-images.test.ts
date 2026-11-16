import { expect, test, vi } from 'vitest';
import { Hipnose, parseHipnose } from '../src/application/behavior/hipnose.js';
import { HipnoseImages, findHipnoseImages } from '../src/application/assets/hipnose-images.js';
import { BehaviorRuntime } from '../src/application/behavior/runtime.js';
import {
  assistantBehaviorSchema,
  defaultAssistantBehavior,
  type AssistantBehavior,
} from '../src/domain/model/assistant-behavior.js';
import { rinAssetCatalogSchema, type RinAssetImage } from '../src/domain/model/rin-assets.js';
import type { AssistantBehaviorRepository } from '../src/application/ports/assistant-behavior.js';
import type {
  NotificationPayload,
  NotificationResult,
} from '../src/application/ports/notification.js';
import {
  attachRinVisualAsset,
  rinAppearance,
  RinVisualAssets,
} from '../src/application/assets/selection.js';
import { WorldAssetEnvironment } from '../src/application/assets/environment.js';
import { SyncRinAssets } from '../src/application/assets/sync.js';
import { AgentContextBuilder } from '../src/application/agent/context-builder.js';
import { RunAgent } from '../src/application/use-cases/run-agent.js';
import { AppError } from '../src/domain/errors/app-error.js';
import { rinManualOutfits, manualRinOutfitSet } from '../src/domain/model/rin-manual-outfits.js';
import { eligibleRinAssetSets } from '../src/application/assets/selection.js';

const clock = { now: () => new Date('2026-10-14T15:00:00Z') };
const image = (id: string, expression: RinAssetImage['expression'] = 'NEUTRAL'): RinAssetImage => ({
  id,
  name: id,
  expression,
  objectKey: `assistants/RIN/${'a'.repeat(64)}.png`,
  sha256: 'a'.repeat(64),
  contentType: 'image/png',
  sizeBytes: 100,
});
const catalog = rinAssetCatalogSchema.parse({
  assistantId: 'RIN',
  version: 'v1',
  publishedAt: clock.now().toISOString(),
  sets: [
    {
      id: 'HOLYDAY',
      name: 'Rin Holyday',
      useCase: 'Biquíni floral e saída de praia.',
      rules: { dates: ['12-25'], weather: 'SUNNY' },
      fallbackExpression: 'SOFT_SMILE',
      images: [image('rin_holyday', 'SOFT_SMILE')],
    },
    {
      id: 'PAJAMAS',
      name: 'Rin de pijama à noite',
      useCase: 'Visual de pijama rosa.',
      rules: { timeWindow: { start: '22:00', end: '06:00' } },
      fallbackExpression: 'TIRED',
      images: [image('rin_pajamas', 'TIRED')],
    },
  ],
});
const payload = {
  assistantId: 'RIN',
  message: 'oi',
  avatarState: 'NEUTRAL' as const,
  priority: 'NORMAL' as const,
  actions: [],
};
function fixture() {
  const statesByKey = new Map<string, AssistantBehavior>();
  const initial = {
    ...defaultAssistantBehavior('u', 'RIN', clock.now()),
    diagnosticsEnabled: true,
  };
  statesByKey.set('u:RIN', initial);
  const states: AssistantBehaviorRepository = {
    get: vi.fn(async (u: string, a: string) =>
      structuredClone(statesByKey.get(`${u}:${a}`) ?? null),
    ),
    save: vi.fn(async (value: AssistantBehavior, version: number | null) => {
      if (statesByKey.get(`${value.userId}:${value.assistantId}`)?.version !== version)
        throw new AppError('behavior_conflict', 409);
      statesByKey.set(`${value.userId}:${value.assistantId}`, assistantBehaviorSchema.parse(value));
    }),
  };
  const personalities = {
    get: async () => ({
      id: 'tsundere',
      name: 'Tsundere',
      version: 1,
      enabled: true,
      traits: {},
      guidance: ['Be useful.'],
    }),
    insertMissing: vi.fn(),
  };
  const runtime = new BehaviorRuntime(states, personalities);
  const device = {
    userId: 'u',
    id: 'android',
    platform: 'android' as const,
    pushToken: 'token',
    enabled: true,
    createdAt: clock.now().toISOString(),
    updatedAt: clock.now().toISOString(),
  };
  const devices = {
    get: vi.fn(async () => device),
    list: vi.fn(async () => [device]),
    put: vi.fn(),
    delete: vi.fn(),
    getOwnership: vi.fn(async () => ({
      ...device,
      deviceId: device.id,
      ownerUserId: device.userId,
    })),
  };
  const notifications = {
    send: vi
      .fn<(token: string, payload: NotificationPayload) => Promise<NotificationResult>>()
      .mockResolvedValue({ status: 'sent' }),
  };
  const storage = {
    verify: vi.fn(),
    download: vi.fn(async () => ({
      url: 'https://example.com/private-image',
      expiresAt: '2026-10-14T16:00:00Z',
    })),
  };
  const catalogs = { get: vi.fn(async () => structuredClone(catalog)), publish: vi.fn() };
  const deliveries = { get: vi.fn(), put: vi.fn() };
  const images = new HipnoseImages({
    catalog: catalogs,
    states,
    clock,
    deliveries,
    delivery: { devices, notifications, storage },
  });
  const hipnose = new Hipnose(runtime, clock, images);
  return {
    statesByKey,
    states,
    runtime,
    devices,
    notifications,
    storage,
    catalogs,
    images,
    hipnose,
    initial,
    deliveries,
  };
}

test.each([
  ['hipnose, se vista pra praia', { kind: 'image-use', target: 'pra praia' }],
  ['hipnose use sue pijama', { kind: 'image-use', target: 'sue pijama' }],
  ['hipnose: use rin_Pajamas', { kind: 'image-use', target: 'rin_Pajamas' }],
  ['Rin, hipnose liste imagens disponíveis', { kind: 'image-list', page: 1 }],
  ['hipnose quais imagens você tem?', { kind: 'image-list', page: 1 }],
  ['hipnose me liste as imagens página 2', { kind: 'image-list', page: 2 }],
  ['hipnose imagens automáticas', { kind: 'image-auto' }],
  ['hipnose volte ao modo automático', { kind: 'image-auto' }],
  ['hipnose: humor 0', { kind: 'set', field: 'moodScore', value: '0' }],
  ['hipnose: intimidade 10', { kind: 'set', field: 'intimacyScore', value: '10' }],
  ['use fantasia de coelinha', { kind: 'image-use', target: 'de coelinha' }],
  ['Rin, use a fantasia de maid sexy!', { kind: 'image-use', target: 'de maid sexy' }],
])('parses direct command %s', (text, result) => expect(parseHipnose(text)).toEqual(result));

test.each([
  'hipnose use pijama?',
  'hipnose use pijama\ne humor 0',
  'hipnose use "rin_pajamas"',
  'hipnose use pijama e humor 0',
  'use fantasia de maid?',
  'use fantasia de maid\ne humor 0',
  'use fantasia de "maid"',
  'use fantasia de maid e use coelinha',
])('rejects unsafe mutation syntax %s', (text) => {
  expect(parseHipnose(text)).toEqual({ kind: 'invalid' });
});
test('ordinary text and quoted examples cannot select an image', () => {
  expect(parseHipnose('se vista pra praia')).toBeNull();
  expect(parseHipnose('Ele disse: hipnose use pijama')).toBeNull();
  expect(parseHipnose('"hipnose use pijama"')).toBeNull();
  expect(parseHipnose('ela disse: use fantasia de maid')).toBeNull();
  expect(parseHipnose('"use fantasia de maid"')).toBeNull();
});

const manualCatalog = () =>
  rinAssetCatalogSchema.parse({
    ...catalog,
    sets: [
      ...catalog.sets,
      ...rinManualOutfits.map((outfit) => manualRinOutfitSet(image(outfit.id))),
    ],
  });

test.each([
  ['coelinha', 'rin_00_rabbit'],
  ['rabbit', 'rin_00_rabbit'],
  ['fantasia de maid', 'rin_00_maid'],
  ['maid sexy', 'rin_00_sexymaid'],
  ['sexymaid', 'rin_00_sexymaid'],
  ['nua', 'rin_00_nude'],
  ['pelada', 'rin_00_nude'],
])('resolves manual outfit %s without confusing maid with sexy maid', (target, id) => {
  expect(findHipnoseImages(manualCatalog(), target).map((match) => match.image.id)).toEqual([id]);
});

test('manual-only outfits remain listed but are never automatically selected, including legacy catalogs', async () => {
  const f = fixture(),
    c = manualCatalog();
  f.catalogs.get.mockResolvedValue(c);
  const listed = await f.hipnose.handle('u', 'RIN', 'hipnose liste imagens');
  for (const outfit of rinManualOutfits) expect(listed?.message).toContain(outfit.id);
  for (const set of c.sets.slice(2)) {
    delete set.manualOnly;
    set.priority = 1000;
  }
  c.sets.push({
    ...c.sets[2]!,
    id: 'OTHER_MANUAL',
    manualOnly: true,
    images: [image('other_manual')],
  });
  for (const occasion of [
    'morning_briefing',
    'conversation',
    'message',
    'sync',
    'flirt',
  ] as const) {
    expect(eligibleRinAssetSets(c, clock.now(), 'UTC', { occasion, mood: 'playful' })).toEqual([]);
    expect(
      attachRinVisualAsset(
        { ...payload, imageName: 'rin_00_nude', actions: [] },
        c,
        clock.now(),
        'UTC',
        { occasion },
      ).imageName,
    ).toBe('');
    expect(rinAppearance(c, clock.now(), 'UTC', { occasion })).toBeNull();
  }
  expect(f.notifications.send).not.toHaveBeenCalled();
});

test.each([
  ['use fantasia de coelinha', 'rin_00_rabbit'],
  ['use fantasia de maid', 'rin_00_maid'],
  ['use fantasia de maid sexy', 'rin_00_sexymaid'],
  ['hipnose use pelada', 'rin_00_nude'],
])('explicit request %s applies only the requested image with no actions', async (message, id) => {
  const f = fixture();
  f.catalogs.get.mockResolvedValue(manualCatalog());
  const result = await f.hipnose.handle('u', 'RIN', message, 'android');
  expect(result).toMatchObject({ imageName: id, actions: [] });
  expect(f.states.save).not.toHaveBeenCalled();
  expect(f.notifications.send).toHaveBeenCalledTimes(1);
  expect(f.notifications.send).toHaveBeenCalledWith(
    'token',
    expect.objectContaining({ type: 'avatar_image_available', imageName: id }),
  );
  expect(attachRinVisualAsset(payload, manualCatalog(), clock.now(), 'UTC').imageName).toBe('');
});

test('resolves beach from the actual use case, and pijama from metadata despite sue typo', () => {
  expect(findHipnoseImages(catalog, 'pra praia').map((m) => m.image.id)).toEqual(['rin_holyday']);
  expect(findHipnoseImages(catalog, 'sue pijama').map((m) => m.image.id)).toEqual(['rin_pajamas']);
  expect(findHipnoseImages(catalog, 'para marte')).toEqual([]);
});
test('exact case-sensitive name wins and generic outfit picks neutral/fallback within a set', () => {
  const c = structuredClone(catalog);
  c.sets[1]!.images.push(image('RIN_PAJAMAS'));
  expect(findHipnoseImages(c, 'RIN_PAJAMAS').map((m) => m.image.id)).toEqual(['RIN_PAJAMAS']);
  expect(findHipnoseImages(c, 'pijama').map((m) => m.image.id)).toEqual(['RIN_PAJAMAS']);
});

test('lists the enabled catalog regardless of current date/time eligibility', async () => {
  const f = fixture();
  const result = await f.hipnose.handle('u', 'RIN', 'hipnose liste imagens');
  expect(result?.message).toContain('rin_holyday');
  expect(result?.message).toContain('rin_pajamas');
  expect(result?.message).not.toContain('private-image');
  expect(f.states.save).not.toHaveBeenCalled();
  expect(f.notifications.send).not.toHaveBeenCalled();
});

test('manual selection is temporary, prepares download and bypasses calendar rules only for this response', async () => {
  const f = fixture();
  const output = await f.hipnose.handle('u', 'RIN', 'hipnose, se vista pra praia', 'android');
  expect(output?.imageName).toBe('rin_holyday');
  expect(f.notifications.send).toHaveBeenCalledWith(
    'token',
    expect.objectContaining({
      type: 'avatar_image_available',
      imageName: 'rin_holyday',
      imageSha256: 'a'.repeat(64),
    }),
  );
  expect(output?.message).toContain('Na próxima conversa ou sincronização');
  expect(f.statesByKey.get('u:RIN')).toEqual(f.initial);
  expect(f.states.save).not.toHaveBeenCalled();
  expect(f.deliveries.put).toHaveBeenCalledWith('RIN', await f.devices.get(), {
    scope: JSON.stringify(['hipnose-temporary', 'rin_holyday']),
    refreshedAt: clock.now().toISOString(),
  });
});

test('selection stays scoped to the addressed assistant and user, and requires diagnostics permission', async () => {
  const f = fixture();
  expect(await f.hipnose.handle('u', 'RIN', 'Yui, hipnose use pijama')).toBeNull();
  f.statesByKey.set('other:RIN', { ...f.initial, userId: 'other', diagnosticsEnabled: false });
  expect((await f.hipnose.handle('other', 'RIN', 'hipnose use pijama'))?.message).toContain(
    'não está habilitado',
  );
  expect((await f.hipnose.handle('other', 'RIN', 'hipnose liste imagens'))?.message).toContain(
    'não está habilitado',
  );
  expect((await f.hipnose.handle('other', 'RIN', 'use fantasia de maid'))?.message).toContain(
    'não está habilitado',
  );
  expect(f.notifications.send).not.toHaveBeenCalled();
  expect(f.states.save).not.toHaveBeenCalled();
});

test('unknown, disabled or ambiguous requests never change the selection', async () => {
  const f = fixture();
  f.catalogs.get.mockResolvedValue({
    ...catalog,
    sets: [...catalog.sets, { ...catalog.sets[0]!, id: 'BEACH_2', images: [image('rin_beach2')] }],
  });
  expect((await f.hipnose.handle('u', 'RIN', 'hipnose se vista pra praia'))?.message).toContain(
    'Mais de uma imagem',
  );
  expect((await f.hipnose.handle('u', 'RIN', 'hipnose use marciana'))?.message).toContain(
    'Não encontrei',
  );
  f.catalogs.get.mockResolvedValue({
    ...catalog,
    sets: catalog.sets.map((set) => ({ ...set, enabled: false })),
  });
  expect((await f.hipnose.handle('u', 'RIN', 'hipnose use rin_pajamas'))?.message).toContain(
    'Não tenho imagens',
  );
  expect(f.states.save).not.toHaveBeenCalled();
});

test('lists pages without overflowing the Android message contract', async () => {
  const f = fixture();
  f.catalogs.get.mockResolvedValue({
    ...catalog,
    sets: Array.from({ length: 25 }, (_, n) => ({
      ...catalog.sets[0]!,
      id: `set${n}`,
      images: [image(`image${n}`)],
    })),
  });
  const result = await f.hipnose.handle('u', 'RIN', 'hipnose liste imagens 2');
  expect(result?.message).toContain('página 2/3');
  expect(result?.message).toContain('image10');
  expect(result?.message).not.toContain('• image0 ');
  expect(result!.message.length).toBeLessThan(8000);
  expect((await f.hipnose.handle('u', 'RIN', 'hipnose liste imagens 0'))?.message).toContain(
    'Essa página não existe',
  );
});

test('failed availability or a transferred device never persists an override', async () => {
  const f = fixture();
  f.notifications.send.mockResolvedValue({ status: 'failed' });
  expect(
    (await f.hipnose.handle('u', 'RIN', 'hipnose use pijama', 'android'))?.imageName,
  ).toBeUndefined();
  f.devices.getOwnership.mockResolvedValue({
    ...(await f.devices.getOwnership()),
    ownerUserId: 'other',
  });
  f.notifications.send.mockClear();
  await f.hipnose.handle('u', 'RIN', 'hipnose use pijama', 'android');
  expect(f.notifications.send).not.toHaveBeenCalled();
  expect(f.states.save).not.toHaveBeenCalled();
});

test('permission revoked during download preparation and concurrent writes are rechecked', async () => {
  const f = fixture();
  f.notifications.send.mockImplementationOnce(async () => {
    f.statesByKey.set('u:RIN', { ...f.initial, diagnosticsEnabled: false, version: 1 });
    return { status: 'sent' };
  });
  expect((await f.hipnose.handle('u', 'RIN', 'hipnose use pijama'))?.message).toContain(
    'configuração mudou',
  );
  expect(f.states.save).not.toHaveBeenCalled();
});

test('return to automatic does not write behavior state or reset mood recovery', async () => {
  const f = fixture();
  f.statesByKey.set('u:RIN', {
    ...f.initial,
    moodScore: 1,
    updatedAt: '2026-10-14T10:00:00Z',
    manualImageName: 'rin_pajamas',
  });
  expect((await f.hipnose.handle('u', 'RIN', 'hipnose imagens automáticas'))?.message).toContain(
    'automática',
  );
  expect(f.states.save).not.toHaveBeenCalled();
  expect(f.statesByKey.get('u:RIN')).toMatchObject({
    moodScore: 1,
    intimacyScore: 3,
    updatedAt: '2026-10-14T10:00:00Z',
  });
  expect(f.notifications.send).not.toHaveBeenCalled();
});

test('normal replies and appearance always return to the automatic calendar rules', () => {
  expect(rinAppearance(catalog, clock.now(), 'America/Sao_Paulo')).toBeNull();
  expect(attachRinVisualAsset(payload, catalog, clock.now(), 'America/Sao_Paulo').imageName).toBe(
    '',
  );
  expect(
    attachRinVisualAsset({ ...payload, imageName: 'rin_holyday' }, catalog, clock.now(), 'UTC')
      .imageName,
  ).toBe('');
});

test('environment and notifications ignore legacy persistent manual choices', async () => {
  const f = fixture();
  f.statesByKey.set('u:RIN', { ...f.initial, manualImageName: 'rin_pajamas' });
  const env = new WorldAssetEnvironment(
    { get: async () => null } as never,
    { get: async () => null } as never,
    undefined,
    'UTC',
    f.states,
  );
  expect(await env.get('u', clock.now(), 'RIN')).not.toHaveProperty('manualImageName');
  expect(await env.get('u', clock.now(), 'YUI')).not.toHaveProperty('manualImageName');
  expect(await env.get('other', clock.now(), 'RIN')).not.toHaveProperty('manualImageName');
  const visual = new RinVisualAssets(f.catalogs, clock, 'UTC', undefined, env);
  expect((await visual.apply(payload, 'u')).imageName).toBe('');
  expect((await visual.apply(payload, 'other')).imageName).toBe('');
});

test('context builder ignores legacy persisted overrides when rendering future conversations', async () => {
  const f = fixture();
  f.statesByKey.set('u:RIN', { ...f.initial, manualImageName: 'rin_pajamas' });
  const builder = new AgentContextBuilder(
    {
      behavior: f.runtime,
      rinAssetCatalog: f.catalogs,
      persona: {
        get: async () => ({
          userId: 'u',
          name: 'Rin',
          traits: {},
          core: [],
          behavior: {},
          createdAt: clock.now().toISOString(),
          updatedAt: clock.now().toISOString(),
        }),
        put: vi.fn(),
      },
      profile: { get: async () => null, put: vi.fn() },
      relationship: { get: async () => null, put: vi.fn() },
      routine: { get: async () => null, put: vi.fn() },
      people: { get: vi.fn(), list: async () => [], put: vi.fn() },
    },
    { get: async () => ({ currentTime: clock.now().toISOString(), timezone: 'UTC' }) },
  );
  const context = await builder.build('u', 'c');
  expect(context.assetEnvironment).not.toHaveProperty('manualImageName');
  f.statesByKey.set('u:RIN', {
    ...f.initial,
    manualImageName: 'rin_pajamas',
    diagnosticsEnabled: false,
  });
  expect((await builder.build('u', 'c')).assetEnvironment).not.toHaveProperty('manualImageName');
});

test('RunAgent preserves the manual command image and routes hipnose ahead of pending onboarding', async () => {
  const f = fixture();
  const builder = {
    build: vi.fn(async () => ({
      assistantId: 'RIN',
      runtime: { currentTime: clock.now().toISOString(), timezone: 'UTC' },
      rinAssetCatalog: catalog,
      assetEnvironment: {},
    })),
  };
  const onboarding = { handle: vi.fn() };
  const agent = new RunAgent(
    builder as never,
    { render: () => 'system' } as never,
    { run: async () => ({ ...payload, imageName: 'rin_pajamas' }) } as never,
    undefined,
    undefined,
    undefined,
    undefined,
    f.hipnose,
    undefined,
    onboarding as never,
  );
  expect(
    (await agent.execute('u', 'hipnose use sue pijama', 'c', { deviceId: 'android' })).imageName,
  ).toBe('rin_pajamas');
  expect(builder.build).not.toHaveBeenCalled();
  expect(onboarding.handle).not.toHaveBeenCalled();
  expect((await agent.execute('u', 'oi', 'c')).imageName).toBe('');
  expect(builder.build).toHaveBeenCalledTimes(1);
  expect(f.states.save).not.toHaveBeenCalled();
});

test('next scheduled sync restores automatic selection without waiting for the 30-minute refresh', async () => {
  const f = fixture();
  const multi = {
    ...catalog,
    sets: [
      { ...catalog.sets[1]!, images: [image('rin_pajamas'), image('rin_pajamas_tired', 'TIRED')] },
    ],
  };
  f.catalogs.get.mockResolvedValue(multi);
  const device = await f.devices.get();
  const recipients = {
    async *listEnabled() {
      yield device;
    },
  };
  const deliveries = {
    get: vi.fn(async () => ({
      scope: JSON.stringify(['hipnose-temporary', 'rin_pajamas_tired']),
      refreshedAt: clock.now().toISOString(),
    })),
    put: vi.fn(),
  };
  const sync = new SyncRinAssets({
    assistants: {
      getById: async () => ({ id: 'RIN', enabled: true }),
      listAvailable: vi.fn(),
    } as never,
    catalog: f.catalogs,
    storage: f.storage,
    devices: f.devices,
    recipients,
    deliveries,
    notifications: f.notifications,
    clock,
    timezone: 'UTC',
    environment: { get: async () => ({}) },
  });
  await sync.execute('RIN');
  expect(f.notifications.send).toHaveBeenCalledWith('token', {
    type: 'avatar_image_select',
    assistantId: 'RIN',
    imageName: '',
  });
  expect(deliveries.put).toHaveBeenCalledWith(
    'RIN',
    device,
    expect.objectContaining({ scope: JSON.stringify(['v1', '', '']) }),
  );
});

test('sync caches automatic environments separately for each assistant of the same user', async () => {
  const f = fixture();
  const device = await f.devices.get();
  const yuiCatalog = rinAssetCatalogSchema.parse({
    ...catalog,
    assistantId: 'YUI',
    sets: [
      {
        ...catalog.sets[1]!,
        rules: {},
        images: [{ ...image('yui_pajamas'), objectKey: `assistants/YUI/${'a'.repeat(64)}.png` }],
      },
    ],
  });
  const environment = {
    get: vi.fn(async (_user: string, _now: Date, assistant?: string) => ({
      mood: assistant === 'YUI' ? ('happy' as const) : ('neutral' as const),
    })),
  };
  const sync = new SyncRinAssets({
    assistants: {
      listAvailable: async () => [
        { id: 'RIN', enabled: true },
        { id: 'YUI', enabled: true },
      ],
    } as never,
    catalog: {
      get: async (assistant) => (assistant === 'YUI' ? yuiCatalog : catalog),
      publish: vi.fn(),
    },
    storage: f.storage,
    devices: f.devices,
    recipients: {
      async *listEnabled() {
        yield device;
      },
    },
    deliveries: { get: async () => null, put: vi.fn() },
    notifications: f.notifications,
    clock,
    timezone: 'UTC',
    environment,
  });
  await sync.execute();
  expect(environment.get).toHaveBeenCalledTimes(2);
  expect(f.notifications.send).toHaveBeenCalledWith('token', {
    type: 'avatar_image_select',
    assistantId: 'RIN',
    imageName: '',
  });
  expect(f.notifications.send).toHaveBeenCalledWith('token', {
    type: 'avatar_image_select',
    assistantId: 'YUI',
    imageName: 'yui_pajamas',
  });
});

test('temporary outfit choice leaves subsequent mood/personality commands independent', async () => {
  const f = fixture();
  await f.hipnose.handle('u', 'RIN', 'hipnose use pijama');
  expect((await f.hipnose.handle('u', 'RIN', 'hipnose: humor 0'))?.message).toContain(
    'Humor definido',
  );
  expect(f.statesByKey.get('u:RIN')).toMatchObject({
    moodScore: 0,
  });
  expect(
    (await f.hipnose.handle('u', 'RIN', 'hipnose: personalidade tsundere'))?.message,
  ).toContain('Personalidade alterada');
  expect(f.statesByKey.get('u:RIN')).not.toHaveProperty('manualImageName');
});
