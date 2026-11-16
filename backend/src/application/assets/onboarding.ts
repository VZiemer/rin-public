import type {
  AssetOnboardingRepository,
  AssetUsageAnalyzer,
  UploadedAssetSource,
} from '../ports/asset-onboarding.js';
import type { RinAssetCatalogRepository, RinAssetStorage } from '../ports/rin-assets.js';
import type { DeviceRepository } from '../ports/device.js';
import type { NotificationGateway } from '../ports/notification.js';
import type { Clock, IdGenerator } from '../ports/runtime.js';
import {
  assetContextQuestion,
  assetUsageDecisionSchema,
  type AssetOnboarding,
} from '../../domain/model/asset-onboarding.js';
import { rinAssetCatalogSchema, rinAssetSetSchema } from '../../domain/model/rin-assets.js';
import type { AgentOutput } from '../../domain/model/contracts.js';
import { parseUserId } from '../../domain/model/user-id.js';
import { AppError } from '../../domain/errors/app-error.js';
import { createHash } from 'node:crypto';
import { isManualRinImage } from '../../domain/model/rin-manual-outfits.js';
import type { RegisterManualRinOutfits } from './manual-outfits.js';

function reply(message: string, imageName?: string): AgentOutput {
  return {
    message,
    assistantId: 'RIN',
    avatarState: 'FOCUSED',
    priority: 'NORMAL',
    actions: [],
    ...(imageName && !isManualRinImage(imageName) ? { imageName } : {}),
  };
}
export class OnboardUploadedAsset {
  private userId: string;
  constructor(
    private deps: {
      userId: string;
      records: AssetOnboardingRepository;
      source: UploadedAssetSource;
      storage: RinAssetStorage;
      devices: DeviceRepository;
      notifications: NotificationGateway;
      clock: Clock;
      manualOutfits?: RegisterManualRinOutfits;
    },
  ) {
    this.userId = parseUserId(deps.userId);
  }
  async execute(objectKey: string) {
    const image = await this.deps.source.inspect(objectKey);
    if (isManualRinImage(image.id)) {
      if (!this.deps.manualOutfits)
        throw new AppError('manual_outfit_registration_unavailable', 503);
      return this.deps.manualOutfits.execute([image]);
    }
    let record = await this.deps.records.get(this.userId, image.id);
    if (record && record.image.sha256 !== image.sha256)
      throw new AppError('asset_image_name_conflict', 409);
    if (!record) {
      const now = this.deps.clock.now().toISOString();
      const candidate: AssetOnboarding = {
        userId: this.userId,
        assistantId: 'RIN',
        image,
        status: 'pending',
        revision: 0,
        createdAt: now,
        updatedAt: now,
        deliveredDevices: [],
        turns: [],
      };
      if (await this.deps.records.save(candidate, null)) record = candidate;
      else record = await this.deps.records.get(this.userId, image.id);
      if (!record || record.image.sha256 !== image.sha256)
        throw new AppError('asset_image_name_conflict', 409);
    }
    if (!record) throw new Error('Missing asset onboarding record');
    if (record.status !== 'pending') return { status: 'skipped' };
    const available = {
      type: 'avatar_image_available' as const,
      assistantId: 'RIN',
      imageName: image.id,
      imageUrl: (await this.deps.storage.download('RIN', image)).url,
      imageSha256: image.sha256,
    };
    let delivered = 0;
    // list() is bounded at 200 by the device repository; never enumerate other users.
    for (const device of await this.deps.devices.list(this.userId, 200)) {
      if (device.userId !== this.userId || !device.enabled || !device.pushToken) continue;
      const deliveryKey = `${device.id}:${createHash('sha256').update(device.pushToken).digest('hex')}`;
      if (record.deliveredDevices.includes(deliveryKey)) continue;
      const owner = await this.deps.devices.getOwnership?.(device.id);
      if (
        !owner ||
        !owner.enabled ||
        owner.ownerUserId !== this.userId ||
        owner.pushToken !== device.pushToken
      )
        continue;
      const result = await this.deps.notifications.send(device.pushToken, available);
      if (result.status === 'invalid_token') {
        await this.deps.devices.put({
          ...device,
          enabled: false,
          updatedAt: this.deps.clock.now().toISOString(),
        });
        continue;
      }
      if (result.status !== 'sent') throw new Error('Asset availability delivery failed');
      const question = await this.deps.notifications.send(
        device.pushToken,
        reply(assetContextQuestion(image.id), image.id),
      );
      if (question.status === 'invalid_token') {
        await this.deps.devices.put({
          ...device,
          enabled: false,
          updatedAt: this.deps.clock.now().toISOString(),
        });
        continue;
      }
      if (question.status !== 'sent') throw new Error('Asset context question delivery failed');
      const next: AssetOnboarding = {
        ...record,
        revision: record.revision + 1,
        updatedAt: this.deps.clock.now().toISOString(),
        deliveredDevices: [...record.deliveredDevices, deliveryKey].slice(-200),
      };
      if (!(await this.deps.records.save(next, record.revision)))
        throw new Error('Asset onboarding changed during delivery');
      record = next;
      delivered++;
    }
    if (!record.deliveredDevices.length) throw new Error('No eligible developer device');
    return { status: 'sent', delivered };
  }
}

export class AssetContextChat {
  private userId: string;
  constructor(
    private deps: {
      userId: string;
      records: AssetOnboardingRepository;
      analyzer: AssetUsageAnalyzer;
      catalog: RinAssetCatalogRepository;
      storage: RinAssetStorage;
      clock: Clock;
      ids: IdGenerator;
    },
  ) {
    this.userId = parseUserId(deps.userId);
  }
  async handle(userId: string, assistantId: string, message: string): Promise<AgentOutput | null> {
    if (userId !== this.userId || assistantId !== 'RIN') return null;
    const open = await this.deps.records.listOpen(userId);
    if (!open.length) return null;
    const named = open.filter((r) => message.includes(r.image.id));
    const record = named.length === 1 ? named[0]! : open.length === 1 ? open[0]! : undefined;
    if (!record) {
      // Multiple uploads must never assign an unnamed answer to an arbitrary image.
      return reply(
        `There is more than one pending image. Include the image name in your reply: ${open
          .slice(0, 10)
          .map((r) => r.image.id)
          .join(', ')}.`,
      );
    }
    if (record.status === 'ready') return this.publish(record);
    if (message.length > 2000)
      return reply(
        `Can you summarize the rules for "${record.image.id}" in up to 2000 characters?`,
        record.image.id,
      );
    let decision;
    try {
      decision = assetUsageDecisionSchema.parse(await this.deps.analyzer.analyze(record, message));
    } catch {
      return reply(
        `I could not interpret the rules for "${record.image.id}". Can you explain the occasion and times or dates?`,
        record.image.id,
      );
    }
    if (decision.status === 'unrelated') return null;
    const question = decision.status === 'clarify' ? decision.question : '';
    const next: AssetOnboarding = {
      ...record,
      revision: record.revision + 1,
      updatedAt: this.deps.clock.now().toISOString(),
      turns: [...record.turns.slice(-19), { answer: message, question }],
      ...(decision.status === 'understood'
        ? { status: 'ready' as const, usage: decision.usage }
        : {}),
    };
    if (!(await this.deps.records.save(next, record.revision)))
      return reply(
        'The image registration changed while you were replying. Send your answer again.',
      );
    if (decision.status === 'clarify')
      return reply(`Sobre "${record.image.id}": ${question}`, record.image.id);
    return this.publish(next);
  }
  private async publish(record: AssetOnboarding): Promise<AgentOutput> {
    if (!record.usage) throw new Error('Missing asset usage');
    const image = { ...record.image, expression: record.usage.expression };
    await this.deps.storage.verify('RIN', image);
    let version: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.deps.catalog.get('RIN');
      const existing = current?.sets.find((set) => set.images.some((img) => img.id === image.id));
      const set = rinAssetSetSchema.parse({
        id: image.id,
        name: image.name,
        enabled: true,
        priority: record.usage.priority,
        useCase: record.usage.useCase,
        rules: record.usage.rules,
        ...(record.usage.manualOnly !== undefined ? { manualOnly: record.usage.manualOnly } : {}),
        fallbackExpression: image.expression,
        images: [image],
      });
      if (existing) {
        // A manual publication wins; never overwrite a different set or its rules.
        if (JSON.stringify(existing) !== JSON.stringify(set))
          throw new AppError('asset_already_catalogued', 409);
        version = current!.version;
        break;
      }
      const catalog = rinAssetCatalogSchema.parse({
        assistantId: 'RIN',
        version: `onboard-${this.deps.ids.next()}`,
        publishedAt: this.deps.clock.now().toISOString(),
        sets: [...(current?.sets ?? []), set],
      });
      if (new TextEncoder().encode(JSON.stringify(catalog)).length > 300000)
        throw new AppError('asset_catalog_too_large', 413);
      try {
        await this.deps.catalog.publish(catalog, current?.version ?? null);
        version = catalog.version;
        break;
      } catch (error) {
        if (
          !(error instanceof AppError) ||
          error.message !== 'asset_catalog_version_conflict' ||
          attempt === 2
        )
          throw error;
      }
    }
    if (!version) throw new Error('Asset publication failed');
    const completed: AssetOnboarding = {
      ...record,
      status: 'completed',
      catalogVersion: version,
      revision: record.revision + 1,
      updatedAt: this.deps.clock.now().toISOString(),
    };
    await this.deps.records.save(completed, record.revision);
    return reply(
      `I saved the context and rules for "${image.id}" for future use: ${record.usage.useCase}`,
    );
  }
}
