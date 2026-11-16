import type {
  RinAssetCatalogRepository,
  RinAssetStorage,
  AssetDeviceSource,
} from '../ports/rin-assets.js';
import type { AssistantRepository } from '../ports/assistant.js';
import { parseAssistantId } from '../../domain/model/assistant-id.js';
import type { DeviceRepository } from '../ports/device.js';
import type { NotificationGateway } from '../ports/notification.js';
import type { Clock } from '../ports/runtime.js';
import type { RinAssetCatalog, AvatarImageCommand } from '../../domain/model/rin-assets.js';
import { publishRinAssetsSchema, selectRinAssetsSchema } from '../../domain/model/rin-assets.js';
import { AppError } from '../../domain/errors/app-error.js';
import { isBundledRinImage } from '../../domain/model/seasonal-assets.js';

export class ReadRinAssets {
  constructor(
    private catalog: RinAssetCatalogRepository,
    private storage: RinAssetStorage,
    private assistants: AssistantRepository,
  ) {}
  async execute(assistantId: string) {
    const id = parseAssistantId(assistantId);
    const assistant = await this.assistants.getById(id);
    if (!assistant || !assistant.enabled) throw new AppError('ASSISTANT_NOT_FOUND', 404);
    const catalog = await this.catalog.get(id);
    if (!catalog)
      return {
        schemaVersion: 2,
        assistantId: id,
        version: null,
        publishedAt: null,
        sets: [],
      };
    return {
      schemaVersion: 2,
      ...catalog,
      sets: await Promise.all(
        catalog.sets.map(async (set) => ({
          ...set,
          images: await Promise.all(
            set.images.map(async ({ objectKey: _key, ...image }) => ({
              ...image,
              ...(await this.storage.download(id, { ...image, objectKey: _key })),
            })),
          ),
        })),
      ),
    };
  }
}

export class PublishRinAssets {
  constructor(
    private deps: {
      catalog: RinAssetCatalogRepository;
      storage: RinAssetStorage;
      devices: DeviceRepository;
      recipients: AssetDeviceSource;
      assistants: AssistantRepository;
      notifications: NotificationGateway;
      clock: Clock;
    },
  ) {}
  async execute(input: unknown) {
    const command = publishRinAssetsSchema.parse(input);
    await this.ensureAssistant(command.assistantId);
    const existing = await this.deps.catalog.get(command.assistantId);
    let catalog: RinAssetCatalog;
    if (existing?.version === command.version) {
      if (JSON.stringify(existing.sets) !== JSON.stringify(command.sets))
        throw new AppError('asset_catalog_version_conflict', 409);
      catalog = existing;
    } else {
      if ((existing?.version ?? null) !== command.expectedVersion)
        throw new AppError('asset_catalog_version_conflict', 409);
      catalog = {
        assistantId: command.assistantId,
        version: command.version,
        publishedAt: this.deps.clock.now().toISOString(),
        sets: command.sets,
      };
      if (new TextEncoder().encode(JSON.stringify(catalog)).length > 300000)
        throw new AppError('asset_catalog_too_large', 413);
      // Bound concurrent S3 requests; publish only after every image is present and verified.
      const images = catalog.sets.flatMap((set) => set.images);
      for (let offset = 0; offset < images.length; offset += 8)
        await Promise.all(
          images
            .slice(offset, offset + 8)
            .map((image) => this.deps.storage.verify(command.assistantId, image)),
        );
      await this.deps.catalog.publish(catalog, command.expectedVersion);
    }
    return this.notifyCatalog(catalog);
  }
  async notify(assistantId: string) {
    const id = parseAssistantId(assistantId);
    await this.ensureAssistant(id);
    const catalog = await this.deps.catalog.get(id);
    if (!catalog) throw new AppError('asset_catalog_not_found', 404);
    return this.notifyCatalog(catalog);
  }
  async select(input: unknown) {
    const command = selectRinAssetsSchema.parse(input);
    await this.ensureAssistant(command.assistantId);
    const catalog = await this.deps.catalog.get(command.assistantId);
    if (
      command.imageName &&
      !catalog?.sets.some((set) => set.images.some((image) => image.id === command.imageName))
    )
      throw new AppError('asset_image_not_found', 404);
    return {
      decision: 'SELECTED',
      assistantId: command.assistantId,
      ...(await this.broadcast([
        {
          type: 'avatar_image_select',
          assistantId: command.assistantId,
          imageName: command.imageName,
        },
      ])),
    };
  }
  private async ensureAssistant(assistantId: string) {
    const assistant = await this.deps.assistants.getById(assistantId);
    if (!assistant || !assistant.enabled) throw new AppError('ASSISTANT_NOT_FOUND', 404);
  }
  private async notifyCatalog(catalog: RinAssetCatalog) {
    const payloads: AvatarImageCommand[] = await Promise.all(
      catalog.sets
        .flatMap((set) => set.images)
        .filter((image) => !isBundledRinImage(catalog.assistantId, image.id))
        .map(async (image) => ({
          type: 'avatar_image_available' as const,
          assistantId: catalog.assistantId,
          imageName: image.id,
          imageUrl: (await this.deps.storage.download(catalog.assistantId, image)).url,
          imageSha256: image.sha256,
        })),
    );
    return {
      decision: 'PUBLISHED',
      assistantId: catalog.assistantId,
      version: catalog.version,
      ...(await this.broadcast(payloads)),
    };
  }
  private async broadcast(payloads: AvatarImageCommand[]) {
    const { devices, notifications, clock } = this.deps;
    const results = [];
    for await (const device of this.deps.recipients.listEnabled()) {
      if (!device.enabled || !device.pushToken) continue;
      if (devices.getOwnership) {
        const owner = await devices.getOwnership(device.id);
        if (
          !owner?.enabled ||
          owner.ownerUserId !== device.userId ||
          owner.pushToken !== device.pushToken
        )
          continue;
      }
      for (const payload of payloads) {
        try {
          const result = await notifications.send(device.pushToken, payload);
          if (result.status === 'invalid_token')
            await devices.put({ ...device, enabled: false, updatedAt: clock.now().toISOString() });
          results.push({
            deviceId: device.id,
            imageName: payload.imageName,
            type: payload.type,
            ...result,
          });
          if (result.status === 'invalid_token') break;
        } catch {
          results.push({
            deviceId: device.id,
            imageName: payload.imageName,
            type: payload.type,
            status: 'failed' as const,
          });
        }
      }
    }
    return {
      notified: results.filter((result) => result.status === 'sent').length,
      results,
    };
  }
}
