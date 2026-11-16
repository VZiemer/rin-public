import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { ReminderRepository } from '../../../application/ports/reminder.js';
import type { Reminder } from '../../../domain/model/contracts.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';
import { key, toItem } from './mapping.js';
export const reminderSchema = owned.extend({
  id: z.string(),
  title: z.string(),
  scheduledAt: z.iso.datetime().optional(),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(['active', 'completed', 'cancelled']),
  relatedPersonId: z.string().optional(),
  relatedTaskId: z.string().optional(),
  notificationState: z.record(z.string(), z.unknown()).optional(),
});
export class DynamoDbReminderRepository implements ReminderRepository {
  private store: DynamoStore<Reminder>;
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {
    this.store = new DynamoStore(client, table, 'REMINDER', reminderSchema);
  }
  get(u: string, id: string) {
    return this.store.get(u, id);
  }
  list(u: string, limit?: number) {
    return this.store.list(u, limit);
  }
  async create(v: Reminder) {
    if (!(await this.store.put(v, v.id, 'insert-missing')))
      throw new Error('Reminder already exists');
  }
  async update(v: Reminder, updatedAt: string) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: toItem(reminderSchema.parse(v), 'REMINDER', v.id),
          ConditionExpression: 'updatedAt = :updated',
          ExpressionAttributeValues: { ':updated': updatedAt },
        }),
      );
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === 'ConditionalCheckFailedException') return false;
      throw e;
    }
  }
  async updateNotificationState(
    userId: string,
    id: string,
    notificationState: Record<string, unknown>,
    now: Date,
  ) {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.table,
          Key: key(userId, 'REMINDER', id),
          UpdateExpression: 'SET notificationState = :notificationState, updatedAt = :updatedAt',
          ConditionExpression: '#status = :active',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':notificationState': notificationState,
            ':updatedAt': now.toISOString(),
            ':active': 'active',
          },
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return;
      throw error;
    }
  }
}
