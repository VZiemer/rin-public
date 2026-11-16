import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { TaskRepository } from '../../../application/ports/task.js';
import type { Task } from '../../../domain/model/contracts.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';
import { toItem } from './mapping.js';
export const taskSchema = owned.extend({
  id: z.string(),
  title: z.string(),
  status: z.enum(['pending', 'completed', 'cancelled']),
  relatedPersonId: z.string().optional(),
});
export class DynamoDbTaskRepository implements TaskRepository {
  private store: DynamoStore<Task>;
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {
    this.store = new DynamoStore(client, table, 'TASK', taskSchema);
  }
  get(u: string, id: string) {
    return this.store.get(u, id);
  }
  list(u: string, limit?: number) {
    return this.store.list(u, limit);
  }
  async create(v: Task) {
    if (!(await this.store.put(v, v.id, 'insert-missing'))) throw new Error('Task already exists');
  }
  async update(v: Task, status: Task['status']) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: toItem(taskSchema.parse(v), 'TASK', v.id),
          ConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status },
        }),
      );
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === 'ConditionalCheckFailedException') return false;
      throw e;
    }
  }
}
