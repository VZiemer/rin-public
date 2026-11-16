import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { PublicWorldSources } from '../adapters/outbound/world/public-sources.js';
import { DynamoDbWorldSettingsRepository } from '../adapters/outbound/dynamodb/world-repository.js';
import { DynamoDbRinWorldContextRepository } from '../adapters/outbound/dynamodb/context-repositories.js';
import { DynamoDbTickUserSource } from '../adapters/outbound/dynamodb/tick-repositories.js';
import { RefreshWorldContext } from '../application/world/refresh.js';
import { runPerUserTick } from '../application/use-cases/per-user-tick.js';
import { z } from 'zod';

export async function handler(event: unknown = {}) {
  const input = z.object({ userId: z.string().uuid().optional() }).parse(event);
  const config = loadConfig();
  if (!config.worldRefreshEnabled) return { decision: 'SILENT', reason: 'disabled' };
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: config.region, maxAttempts: 2 }),
    {
      marshallOptions: { removeUndefinedValues: true },
    },
  );
  const refresh = new RefreshWorldContext({
    settings: new DynamoDbWorldSettingsRepository(client, config.tableName),
    world: new DynamoDbRinWorldContextRepository(client, config.tableName),
    sources: new PublicWorldSources(),
    clock: { now: () => new Date() },
    logger,
  });
  return runPerUserTick({
    name: 'world_refresh',
    users: input.userId
      ? { listUserIdsWithDevices: async () => [input.userId!] }
      : new DynamoDbTickUserSource(client, config.tableName),
    run: (userId) => refresh.execute(userId),
    logger,
  });
}
