import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { MemoryRepository, MemoryFilter } from '../../../application/ports/memory.js';
import type { MemoryEntry } from '../../../domain/model/contracts.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';
import { key, fromItem } from './mapping.js';
const schema = owned.extend({
  id: z.string(),
  content: z.string().min(1).max(2000),
  category: z.string().min(1).max(64),
});
export class DynamoDbMemoryRepository implements MemoryRepository {
  private store: DynamoStore<MemoryEntry>;
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {
    this.store = new DynamoStore(client, table, 'MEMORY', schema);
  }
  get(u: string, id: string) {
    return this.store.get(u, id);
  }
  async put(v: MemoryEntry) {
    await this.store.put(v, v.id);
  }
  delete(u: string, id: string) {
    return this.store.delete(u, id);
  }
  async list(u: string, filter: MemoryFilter = {}) {
    const limit = z
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(filter.limit ?? 20);
    if (filter.since) z.iso.datetime({ offset: true }).parse(filter.since);
    let cursor: Record<string, unknown> | undefined;
    let values: MemoryEntry[] = [];
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': key(u, 'MEMORY').PK, ':prefix': 'MEMORY#' },
          ConsistentRead: true,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      values.push(
        ...(page.Items ?? [])
          .map((item) => schema.parse(fromItem(item)))
          .filter(
            (v) =>
              (!filter.category || v.category === filter.category) &&
              (!filter.since || Date.parse(v.updatedAt) >= Date.parse(filter.since)),
          ),
      );
      values = values
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
        .slice(0, limit);
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return values;
  }
}
