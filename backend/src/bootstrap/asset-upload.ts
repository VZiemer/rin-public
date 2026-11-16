import { S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { contextRepositories } from './repositories.js';
import { notificationGateway } from './notifications.js';
import { S3RinAssetStorage } from '../adapters/outbound/assets/s3.js';
import { S3UploadedAssetSource } from '../adapters/outbound/assets/uploaded-asset.js';
import { OnboardUploadedAsset } from '../application/assets/onboarding.js';
import { RegisterManualRinOutfits } from '../application/assets/manual-outfits.js';
import { randomUUID } from 'node:crypto';

const eventSchema = z.object({
  Records: z
    .array(
      z.object({
        eventSource: z.literal('aws:s3'),
        eventName: z.string(),
        s3: z.object({
          bucket: z.object({ name: z.string() }),
          object: z.object({ key: z.string() }),
        }),
      }),
    )
    .min(1)
    .max(100),
});

export async function createAssetUploadProcessor() {
  const config = loadConfig();
  if (
    config.environment !== 'dev' ||
    !config.assetOnboardingEnabled ||
    !config.assetBucketName ||
    !config.firebaseSecretArn
  )
    throw new Error('Developer asset onboarding is not configured');
  const repos = contextRepositories();
  const client = new S3Client({ region: config.region, maxAttempts: 2 });
  return new OnboardUploadedAsset({
    userId: config.internalUserId ?? '',
    records: repos.assetOnboarding,
    source: new S3UploadedAssetSource(client, config.assetBucketName),
    storage: new S3RinAssetStorage(client, config.assetBucketName),
    devices: repos.devices,
    notifications: await notificationGateway(config.region, config.firebaseSecretArn),
    clock: { now: () => new Date() },
    manualOutfits: new RegisterManualRinOutfits({
      catalog: repos.rinAssetCatalog,
      storage: new S3RinAssetStorage(client, config.assetBucketName),
      clock: { now: () => new Date() },
      ids: { next: randomUUID },
      onboarding: { userId: config.internalUserId ?? '', records: repos.assetOnboarding },
    }),
  });
}
let processor: Promise<OnboardUploadedAsset> | undefined;
export async function handler(input: unknown) {
  const config = loadConfig();
  if (config.environment !== 'dev' || !config.assetOnboardingEnabled) return { status: 'disabled' };
  if (z.object({ Event: z.literal('s3:TestEvent') }).safeParse(input).success)
    return { status: 'test' };
  const event = eventSchema.parse(input);
  const results = [];
  try {
    for (const record of event.Records) {
      if (record.s3.bucket.name !== config.assetBucketName)
        throw new Error('Unexpected asset bucket');
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      if (
        !record.eventName.startsWith('ObjectCreated:') ||
        !key.startsWith('assistants/RIN/') ||
        !/\.(png|webp|jpg)$/.test(key)
      )
        continue;
      results.push(await (await (processor ??= createAssetUploadProcessor())).execute(key));
    }
    return { results };
  } catch (error) {
    processor = undefined;
    throw error;
  }
}
