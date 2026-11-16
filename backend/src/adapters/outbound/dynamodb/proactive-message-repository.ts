import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type {
  ProactiveMessage,
  ProactiveMessageRepository,
} from '../../../application/ports/proactive-message.js';
import type { DocumentClient } from './store.js';

const messageSchema = z.object({
  message: z.string().min(1).max(1800),
  createdAt: z.iso.datetime(),
  topic: z.string().optional(),
  opportunity: z.record(z.string(), z.unknown()).optional(),
});

/** Reuses the delivery log, including messages sent before this reader existed. */
export class DynamoDbProactiveMessageRepository implements ProactiveMessageRepository {
  constructor(
    private readonly client: DocumentClient,
    private readonly table: string,
  ) {}

  async listRecent(userId: string, limit: number): Promise<ProactiveMessage[]> {
    if (!userId || userId.includes('#')) throw new Error('Invalid proactive message user id');
    if (!Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new Error('Invalid proactive message limit');
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':prefix': 'RIN_PROACTIVE_LOG#',
        },
        ScanIndexForward: false,
        ConsistentRead: true,
        Limit: limit,
      }),
    );
    return (result.Items ?? []).flatMap((item) => {
      const parsed = messageSchema.safeParse(item);
      if (!parsed.success) return [];
      return [
        {
          message: parsed.data.message,
          sentAt: parsed.data.createdAt,
          topic: parsed.data.topic,
          opportunity: parsed.data.opportunity,
        },
      ];
    });
  }
}
