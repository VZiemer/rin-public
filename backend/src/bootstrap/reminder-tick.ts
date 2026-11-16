import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { notificationGateway } from './notifications.js';
import { logFields } from '../application/ports/logger.js';
import { DynamoDbDeviceRepository } from '../adapters/outbound/dynamodb/device-repository.js';
import { DynamoDbReminderRepository } from '../adapters/outbound/dynamodb/reminder-repository.js';
import {
  DynamoDbRinLogRepository,
  DynamoDbTickUserSource,
} from '../adapters/outbound/dynamodb/tick-repositories.js';
import { BedrockRinTextGateway } from '../adapters/outbound/agent-model/bedrock-text.js';
import {
  DynamoDbPersonaRepository,
  DynamoDbRelationshipRepository,
  DynamoDbRinEpisodeRepository,
  DynamoDbRinPreferencesRepository,
  DynamoDbRinStateRepository,
  DynamoDbRinWorldContextRepository,
  DynamoDbUserProfileRepository,
} from '../adapters/outbound/dynamodb/context-repositories.js';
import { ReminderTick, type ReminderTickDeps } from '../application/use-cases/reminder-tick.js';
import { runPerUserTick } from '../application/use-cases/per-user-tick.js';
import { RinVisualAssets } from '../application/assets/selection.js';
import { DynamoDbRinAssetCatalogRepository } from '../adapters/outbound/dynamodb/rin-asset-repository.js';
import { assetEnvironment } from './asset-environment.js';
import { withRinTextStyle } from '../application/agent/rin-style-text.js';
import { BehaviorRuntime } from '../application/behavior/runtime.js';
import { contextRepositories } from './repositories.js';

type Runner = (event: unknown) => Promise<Record<string, unknown>>;
let runner: Promise<Runner> | undefined;

async function createRunner(): Promise<Runner> {
  const config = loadConfig();
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: config.region, maxAttempts: 2 }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  const table = config.tableName;
  const users = new DynamoDbTickUserSource(client, table);
  const behaviorRepos = contextRepositories();
  const behavior = new BehaviorRuntime(
    behaviorRepos.assistantBehavior,
    behaviorRepos.personalities,
    behaviorRepos.assistants,
  );
  const visualAssets = new RinVisualAssets(
    new DynamoDbRinAssetCatalogRepository(client, table),
    { now: () => new Date() },
    config.timezone,
    logger,
    assetEnvironment(client, table, config.timezone),
  );
  const shared: Omit<ReminderTickDeps, 'userId'> = {
    reminders: new DynamoDbReminderRepository(client, table),
    devices: new DynamoDbDeviceRepository(client, table),
    rinState: new DynamoDbRinStateRepository(client, table),
    rinPreferences: new DynamoDbRinPreferencesRepository(client, table),
    rinWorldContext: new DynamoDbRinWorldContextRepository(client, table),
    persona: new DynamoDbPersonaRepository(client, table),
    profile: new DynamoDbUserProfileRepository(client, table),
    relationship: new DynamoDbRelationshipRepository(client, table),
    rinEpisodes: new DynamoDbRinEpisodeRepository(client, table),
    text: new BedrockRinTextGateway(
      new BedrockRuntimeClient({ region: config.region, maxAttempts: 1 }),
      config.bedrockModelId,
    ),
    notifications: await notificationGateway(config.region, config.firebaseSecretArn),
    logs: new DynamoDbRinLogRepository(client, table),
    clock: { now: () => new Date() },
    logger,
    config: { timezone: config.timezone, ...config.reminderTick },
  };
  return (event) =>
    runPerUserTick({
      name: 'reminder_tick',
      users,
      logger,
      run: (userId) =>
        new ReminderTick({
          ...shared,
          text: withRinTextStyle(shared.text, () =>
            behavior.get(userId, 'RIN', shared.clock.now()),
          ),
          userId,
          notifications: visualAssets.notifications(shared.notifications, userId),
        }).execute(event),
    });
}

export async function handler(event: unknown) {
  const config = loadConfig();
  if (!config.reminderTickEnabled) return { decision: 'SILENT', reason: 'disabled' };
  try {
    return await (
      await (runner ??= createRunner())
    )(event);
  } catch (error) {
    runner = undefined;
    logger.event(
      'reminder_tick_error',
      logFields({
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
}
