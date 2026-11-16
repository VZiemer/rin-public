import { S3Client } from '@aws-sdk/client-s3';
import { S3RinAssetStorage } from '../adapters/outbound/assets/s3.js';
import { PublishRinAssets } from '../application/assets/catalog.js';
import { SyncRinAssets } from '../application/assets/sync.js';
import { WorldAssetEnvironment } from '../application/assets/environment.js';
import { rinAssetsCommandSchema } from '../domain/model/rin-assets.js';
import { contextRepositories } from './repositories.js';
import { loadConfig } from './config.js';
import { notificationGateway } from './notifications.js';
import { createAssetUploadProcessor } from './asset-upload.js';

let publisher: ReturnType<typeof createPublisher> | undefined;
async function createPublisher() {
  const config = loadConfig();
  if (!config.assetBucketName || !config.firebaseSecretArn)
    throw new Error('Asset bucket and Firebase secret are required');
  const repos = contextRepositories();
  const shared = {
    catalog: repos.rinAssetCatalog,
    storage: new S3RinAssetStorage(
      new S3Client({ region: config.region, maxAttempts: 2 }),
      config.assetBucketName,
    ),
    devices: repos.devices,
    recipients: repos.assetDevices,
    assistants: repos.assistants,
    notifications: await notificationGateway(config.region, config.firebaseSecretArn),
    clock: { now: () => new Date() },
  };
  return {
    publish: new PublishRinAssets(shared),
    sync: new SyncRinAssets({
      ...shared,
      deliveries: repos.assetSelections,
      timezone: config.timezone,
      environment: new WorldAssetEnvironment(
        repos.worldSettings,
        repos.rinWorldContext,
        repos.rinState,
        config.timezone,
        repos.assistantBehavior,
      ),
    }),
  };
}
/** IAM-only administrative invocation. No public HTTP publishing endpoint. */
export async function handler(input: unknown) {
  const event = rinAssetsCommandSchema.parse(input);
  try {
    const useCase = await (publisher ??= createPublisher());
    if (event.operation === 'publish') {
      const result = await useCase.publish.execute(event);
      return { ...result, selection: await useCase.sync.execute(event.assistantId) };
    }
    if (event.operation === 'notify') return await useCase.publish.notify(event.assistantId);
    if (event.operation === 'select') return await useCase.publish.select(event);
    const config = loadConfig();
    if (
      config.environment === 'dev' &&
      config.assetOnboardingEnabled &&
      (!event.assistantId || event.assistantId === 'RIN')
    ) {
      const repos = contextRepositories();
      const upload = await createAssetUploadProcessor();
      for (const record of await repos.assetOnboarding.listOpen(config.internalUserId ?? '')) {
        if (record.status !== 'pending') continue;
        try {
          await upload.execute(record.image.objectKey);
        } catch {
          console.warn(JSON.stringify({ event: 'asset_onboarding_delivery_retry_failed' }));
        }
      }
    }
    return await useCase.sync.execute(event.assistantId, event.force);
  } catch (error) {
    publisher = undefined;
    throw error;
  }
}
