import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { ScheduledPushClaims } from '../../../application/ports/scheduled-push.js';
import type { DocumentClient } from './store.js';
import { key } from './mapping.js';

export class DynamoDbScheduledPushClaims implements ScheduledPushClaims {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  async claim(userId: string, deviceId: string, scheduledAt: string, now: Date) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            ...key(userId, 'TEST_PUSH_DELIVERY', `${deviceId}:${scheduledAt}`),
            entityType: 'TEST_PUSH_DELIVERY',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            expiresAt: Math.floor(now.getTime() / 1000) + 172800,
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
}
