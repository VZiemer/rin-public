import {
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { z } from 'zod';
import type { OwnedEntity } from '../../../domain/model/contracts.js';
import { key, toItem, fromItem, type EntityType } from './mapping.js';
export type DocumentClient = Pick<DynamoDBDocumentClient, 'send'>;
export class DynamoStore<T extends OwnedEntity> {
  constructor(
    protected client: DocumentClient,
    protected table: string,
    protected type: EntityType,
    private schema: z.ZodType<T>,
  ) {}
  async get(userId: string, id?: string): Promise<T | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: key(userId, this.type, id),
        ConsistentRead: true,
      }),
    );
    return result.Item ? this.schema.parse(fromItem(result.Item)) : null;
  }
  async put(
    value: T,
    id?: string,
    mode: 'insert-missing' | 'overwrite' = 'overwrite',
  ): Promise<boolean> {
    const valid = this.schema.parse(value);
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: toItem(valid, this.type, id),
          ...(mode === 'insert-missing' ? { ConditionExpression: 'attribute_not_exists(PK)' } : {}),
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }
  async list(userId: string, limit = 50): Promise<T[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Invalid list limit');
    const result: T[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: {
            ':pk': key(userId, this.type).PK,
            ':prefix': `${this.type}#`,
          },
          Limit: limit - result.length,
          ConsistentRead: true,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      result.push(...(page.Items ?? []).map((item) => this.schema.parse(fromItem(item))));
      cursor = page.LastEvaluatedKey;
    } while (cursor && result.length < limit);
    return result;
  }
  async delete(userId: string, id: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({ TableName: this.table, Key: key(userId, this.type, id) }),
    );
  }
}
