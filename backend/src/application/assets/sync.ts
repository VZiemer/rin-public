import type { AssistantRepository } from '../ports/assistant.js';
import type { DeviceRepository } from '../ports/device.js';
import type { NotificationGateway, NotificationResult } from '../ports/notification.js';
import type {
  AssetDeviceSource,
  AssetSelectionRepository,
  RinAssetCatalogRepository,
  RinAssetStorage,
  AssetEnvironmentSource,
  AssetEnvironment,
} from '../ports/rin-assets.js';
import type { Clock } from '../ports/runtime.js';
import type { AvatarImageCommand } from '../../domain/model/rin-assets.js';
import { attachRinVisualAsset } from './selection.js';
import { parseAssistantId } from '../../domain/model/assistant-id.js';
import { AppError } from '../../domain/errors/app-error.js';
import { isBundledRinImage } from '../../domain/model/seasonal-assets.js';

/** Calendar boundaries and retries are owned by the backend, even without a conversation. */
export class SyncRinAssets {
  constructor(
    private deps: {
      assistants: AssistantRepository;
      catalog: RinAssetCatalogRepository;
      storage: RinAssetStorage;
      devices: DeviceRepository;
      recipients: AssetDeviceSource;
      deliveries: AssetSelectionRepository;
      notifications: NotificationGateway;
      clock: Clock;
      timezone: string;
      environment?: AssetEnvironmentSource;
    },
  ) {}
  async execute(assistantId?: string, force = false) {
    const { assistants, catalog: catalogs, devices, deliveries, notifications } = this.deps;
    const candidates = assistantId
      ? [await assistants.getById(parseAssistantId(assistantId))]
      : await assistants.listAvailable();
    if (assistantId && (!candidates[0] || !candidates[0].enabled))
      throw new AppError('ASSISTANT_NOT_FOUND', 404);
    const results: Array<{
      assistantId: string;
      deviceId: string;
      status: NotificationResult['status'];
    }> = [];
    const environments = new Map<string, Promise<AssetEnvironment>>();
    for (const assistant of candidates) {
      if (!assistant?.enabled) continue;
      const catalog = await catalogs.get(assistant.id);
      if (!catalog) continue;
      const now = this.deps.clock.now();
      const commandsByScope = new Map<string, AvatarImageCommand[]>();
      for await (const device of this.deps.recipients.listEnabled()) {
        if (!device.enabled || !device.pushToken) continue;
        const owner = await devices.getOwnership?.(device.id);
        if (
          devices.getOwnership &&
          (!owner?.enabled ||
            owner.ownerUserId !== device.userId ||
            owner.pushToken !== device.pushToken)
        )
          continue;
        try {
          const environmentKey = `${device.userId}:${assistant.id}`;
          if (!environments.has(environmentKey))
            environments.set(
              environmentKey,
              this.deps.environment?.get(device.userId, now, assistant.id).catch(() => ({})) ??
                Promise.resolve({}),
            );
          const selected = attachRinVisualAsset(
            {
              assistantId: assistant.id,
              message: 'Avatar synchronization',
              avatarState: 'NEUTRAL',
              priority: 'NORMAL',
              actions: [],
            },
            catalog,
            now,
            this.deps.timezone,
            { ...(await environments.get(environmentKey)), occasion: 'sync' },
          );
          const scope = JSON.stringify([
            catalog.version,
            selected.visualAsset?.setId ?? '',
            selected.imageName ?? '',
          ]);
          const previous = await deliveries.get(assistant.id, device);
          if (
            !force &&
            previous?.scope === scope &&
            now.getTime() - Date.parse(previous.refreshedAt) < 30 * 60_000
          )
            continue;
          let commands = commandsByScope.get(scope);
          if (!commands) {
            const images =
              catalog.sets.find((set) => set.id === selected.visualAsset?.setId)?.images ?? [];
            commands = await Promise.all(
              images
                .filter((image) => !isBundledRinImage(assistant.id, image.id))
                .map(async (image) => ({
                  type: 'avatar_image_available' as const,
                  assistantId: assistant.id,
                  imageName: image.id,
                  imageSha256: image.sha256,
                  imageUrl: (await this.deps.storage.download(assistant.id, image)).url,
                })),
            );
            commandsByScope.set(scope, commands);
          }
          // Availability never activates a file. Selection is an independent command.
          const payloads: AvatarImageCommand[] = [
            ...commands,
            {
              type: 'avatar_image_select',
              assistantId: assistant.id,
              imageName: selected.imageName ?? '',
            },
          ];
          let status: NotificationResult['status'] = 'sent';
          for (const payload of payloads) {
            const result = await notifications.send(device.pushToken, payload);
            if (result.status !== 'sent') status = result.status;
            if (result.status === 'invalid_token') {
              await devices.put({ ...device, enabled: false, updatedAt: now.toISOString() });
              break;
            }
          }
          if (status === 'sent')
            await deliveries.put(assistant.id, device, { scope, refreshedAt: now.toISOString() });
          results.push({ assistantId: assistant.id, deviceId: device.id, status });
        } catch {
          results.push({ assistantId: assistant.id, deviceId: device.id, status: 'failed' });
        }
      }
    }
    return { decision: 'SYNCED', results };
  }
}
