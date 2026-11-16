import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { ReminderMessageRepository } from '../../../application/ports/reminder-message.js';
import type { DocumentClient } from './store.js';

const reference = z.object({ id: z.string().min(1), title: z.string().min(1) });
const logSchema = z.object({
  message: z.string().min(1).max(8000),
  createdAt: z.iso.datetime(),
  reminders: z.object({
    upcoming: z.array(reference),
    overdue: z.array(reference),
    unscheduled: z.array(reference),
  }),
});

export class DynamoDbReminderMessageRepository implements ReminderMessageRepository {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}

  async listRecent(userId: string, limit: number) {
    if (!userId || userId.includes('#') || !Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new Error('Invalid reminder message query');
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'RIN_REMINDER_LOG#' },
        ScanIndexForward: false,
        ConsistentRead: true,
        Limit: limit,
      }),
    );
    return (result.Items ?? []).flatMap((item) => {
      const parsed = logSchema.safeParse(item);
      if (!parsed.success) return [];
      const batch = parsed.data.reminders;
      return [
        {
          message: parsed.data.message,
          sentAt: parsed.data.createdAt,
          reminders: [...batch.upcoming, ...batch.overdue, ...batch.unscheduled],
        },
      ];
    });
  }
}
