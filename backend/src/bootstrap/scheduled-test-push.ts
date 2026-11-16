import { randomInt } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { notificationGateway } from './notifications.js';
import { DynamoDbDeviceRepository } from '../adapters/outbound/dynamodb/device-repository.js';
import { DynamoDbScheduledPushClaims } from '../adapters/outbound/dynamodb/scheduled-push-claims.js';
import { SendNotification } from '../application/use-cases/send-notification.js';
import { RinVisualAssets } from '../application/assets/selection.js';
import { DynamoDbRinAssetCatalogRepository } from '../adapters/outbound/dynamodb/rin-asset-repository.js';
import { ScheduledTestPush } from '../application/use-cases/scheduled-test-push.js';
import { parseUserId } from '../domain/model/user-id.js';
import { assetEnvironment } from './asset-environment.js';

const eventSchema = z.object({ scheduledAt: z.iso.datetime({ offset: true }) }).strict();
let runner: Promise<ScheduledTestPush> | undefined;
async function createRunner() {
  const config = loadConfig();
  if (!config.firebaseSecretArn) throw new Error('Firebase secret is required for scheduled tests');
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: config.region, maxAttempts: 2 }),
  );
  const clock = { now: () => new Date() };
  return new ScheduledTestPush(
    new SendNotification(
      new DynamoDbDeviceRepository(client, config.tableName),
      await notificationGateway(config.region, config.firebaseSecretArn),
      clock,
      new RinVisualAssets(
        new DynamoDbRinAssetCatalogRepository(client, config.tableName),
        clock,
        config.timezone,
        undefined,
        assetEnvironment(client, config.tableName, config.timezone),
      ),
    ),
    new DynamoDbScheduledPushClaims(client, config.tableName),
    clock,
    { integer: (upper) => randomInt(upper) },
    parseUserId(config.internalUserId),
    config.testPushDeviceId,
  );
}
export async function handler(input: unknown) {
  const config = loadConfig();
  if (config.environment !== 'dev' || !config.testPushEnabled)
    return { status: 'skipped', reason: 'disabled' };
  const event = eventSchema.parse(input);
  try {
    const result = await (await (runner ??= createRunner())).execute(event.scheduledAt);
    console.info(JSON.stringify({ event: 'scheduled_test_push', ...result }));
    if (result.status !== 'sent' && result.status !== 'skipped')
      throw new Error('Scheduled test push failed');
    return result;
  } catch {
    runner = undefined;
    console.error(JSON.stringify({ event: 'scheduled_test_push_failed' }));
    throw new Error('Scheduled test push failed');
  }
}
