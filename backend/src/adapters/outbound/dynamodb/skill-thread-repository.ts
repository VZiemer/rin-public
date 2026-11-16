import { z } from 'zod';
import type { SkillThreadRepository } from '../../../application/ports/skill-thread.js';
import type { SkillThread } from '../../../application/skills/proactive-engine.js';
import { skillIds } from '../../../domain/skills/definition.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { fromItem } from './mapping.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';

const schema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  skillId: z.enum(skillIds),
  cooldownKey: z.string(),
  reasonCode: z.string(),
  text: z.string(),
  factualContext: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  status: z.enum(['proposed', 'sent', 'failed', 'suppressed']),
  sentAt: z.string().optional(),
});

export class DynamoDbSkillThreadRepository implements SkillThreadRepository {
  private readonly store: DynamoStore<SkillThread>;

  constructor(client: DocumentClient, table: string) {
    this.client = client;
    this.table = table;
    this.store = new DynamoStore(client, table, 'SKILL_THREAD', schema);
  }

  private readonly client: DocumentClient;
  private readonly table: string;

  put(thread: SkillThread) {
    return this.store.put(thread, thread.id).then(() => undefined);
  }

  async get(userId: string, assistantId: string, id: string) {
    const thread = await this.store.get(userId, id);
    return thread?.assistantId === assistantId ? thread : null;
  }

  async listRecent(userId: string, assistantId: string, limit: number) {
    if (!userId || userId.includes('#')) throw new Error('Invalid thread user id');
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      throw new Error('Invalid thread limit');
    // Thread ids are deduplication keys, not timestamps. Read all pages before
    // selecting the latest so old lexicographic ids cannot hide recent sends.
    let cursor: Record<string, unknown> | undefined;
    let records: SkillThread[] = [];
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': 'SKILL_THREAD#' },
          ConsistentRead: true,
          Limit: 200,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      records.push(
        ...(page.Items ?? [])
          .map((item) => schema.parse(fromItem(item)))
          .filter((thread) => thread.assistantId === assistantId),
      );
      records = records
        .sort((a, b) => (b.sentAt ?? b.updatedAt).localeCompare(a.sentAt ?? a.updatedAt))
        .slice(0, limit);
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return records;
  }
}
