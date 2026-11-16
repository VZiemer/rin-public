import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';
import { key } from './mapping.js';
import { worldInterests, type WorldSettings } from '../../../domain/world/model.js';
import type {
  MorningBriefingStore,
  WorldSettingsRepository,
} from '../../../application/ports/world.js';

const settingsSchema = owned.extend({
  enabled: z.boolean(),
  morningBriefingEnabled: z.boolean(),
  interests: z.array(z.enum(worldInterests)).max(4),
  location: z.object({
    city: z.string().min(1),
    region: z.string(),
    countryCode: z.literal('BR'),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    timezone: z.literal('America/Sao_Paulo'),
  }),
});
export class DynamoDbWorldSettingsRepository implements WorldSettingsRepository {
  private readonly store: DynamoStore<WorldSettings>;
  constructor(client: DocumentClient, table: string) {
    this.store = new DynamoStore(client, table, 'WORLD_SETTINGS', settingsSchema);
  }
  get(userId: string) {
    return this.store.get(userId);
  }
  put(value: WorldSettings, mode: 'insert-missing' | 'overwrite' = 'overwrite') {
    return this.store.put(value, undefined, mode);
  }
}

export class DynamoDbMorningBriefingStore implements MorningBriefingStore {
  constructor(
    private readonly client: DocumentClient,
    private readonly table: string,
  ) {}
  async claim(userId: string, date: string, now: Date) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            ...key(userId, 'MORNING_BRIEFING', date),
            entityType: 'MORNING_BRIEFING',
            userId,
            date,
            status: 'pending',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            expiresAt: Math.floor(now.getTime() / 1000) + 30 * 86400,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }
  async finish(userId: string, date: string, status: 'sent' | 'failed', now: Date) {
    await this.client.send(
      new UpdateCommand({
        TableName: this.table,
        Key: key(userId, 'MORNING_BRIEFING', date),
        UpdateExpression: 'SET #status = :status, updatedAt = :now',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status, ':now': now.toISOString() },
      }),
    );
  }
}
