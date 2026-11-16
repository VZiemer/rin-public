import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { ConfirmationRepository } from '../../../application/ports/confirmation.js';
import type { PendingConfirmation } from '../../../domain/model/contracts.js';
import { toolCallSchema } from '../../../domain/model/validation.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';
import { key } from './mapping.js';
const schema = owned.extend({
  id: z.string(),
  conversationId: z.string(),
  toolCall: toolCallSchema,
  status: z.enum(['pending', 'executing', 'approved', 'rejected', 'failed']),
  expiresAt: z.number().int().positive(),
});
export class DynamoDbConfirmationRepository implements ConfirmationRepository {
  private store: DynamoStore<PendingConfirmation>;
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {
    this.store = new DynamoStore(client, table, 'CONFIRMATION', schema);
  }
  get(u: string, id: string) {
    return this.store.get(u, id);
  }
  async create(v: PendingConfirmation) {
    if (!(await this.store.put(v, v.id, 'insert-missing')))
      throw new Error('Confirmation already exists');
  }
  async transition(
    u: string,
    id: string,
    from: PendingConfirmation['status'],
    to: PendingConfirmation['status'],
    now: number,
  ) {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.table,
          Key: key(u, 'CONFIRMATION', id),
          UpdateExpression: 'SET #status = :to, updatedAt = :updated',
          ConditionExpression:
            from === 'pending' ? '#status = :from AND expiresAt > :now' : '#status = :from',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':from': from,
            ':to': to,
            ':updated': new Date(now * 1000).toISOString(),
            ...(from === 'pending' ? { ':now': now } : {}),
          },
        }),
      );
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === 'ConditionalCheckFailedException') return false;
      throw e;
    }
  }
}
