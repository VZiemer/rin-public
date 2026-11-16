import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { WorkingMemoryRepository } from '../../../application/ports/memory.js';
import type { Clock } from '../../../application/ports/runtime.js';
import type { WorkingMemory } from '../../../domain/model/contracts.js';
import { DEFAULT_ASSISTANT_ID, parseAssistantId } from '../../../domain/model/assistant-id.js';
import { owned } from './schemas.js';
import { fromItem, key, workingMemoryKey } from './mapping.js';
import type { DocumentClient } from './store.js';

const schema = owned.extend({
  conversationId: z.string(),
  assistantId: z.string().optional(),
  summary: z.string().max(2000),
  recentTurns: z
    .array(
      z
        .object({
          message: z.string().max(4000),
          reply: z.string().max(4000),
          occurredAt: z.iso.datetime(),
        })
        .strict(),
    )
    .max(4)
    .optional(),
  expiresAt: z.number().int().positive(),
});

export class DynamoDbWorkingMemoryRepository implements WorkingMemoryRepository {
  constructor(
    private readonly client: DocumentClient,
    private readonly table: string,
    private readonly clock: Clock,
  ) {}

  async get(userId: string, conversationId: string, assistantId = DEFAULT_ASSISTANT_ID) {
    const selected = parseAssistantId(assistantId, DEFAULT_ASSISTANT_ID);
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const scoped = await this.read(workingMemoryKey(userId, selected, conversationId));
    if (scoped && scoped.expiresAt > now) return scoped;
    const legacy = await this.read(key(userId, 'WORKING_MEMORY', conversationId));
    if (
      legacy &&
      legacy.expiresAt > now &&
      (legacy.assistantId ?? DEFAULT_ASSISTANT_ID) === selected
    )
      return legacy;
    return null;
  }

  async put(v: WorkingMemory) {
    if (v.expiresAt <= Math.floor(this.clock.now().getTime() / 1000))
      throw new Error('Working memory must expire in future');
    const parsed = schema.parse({
      ...v,
      assistantId: parseAssistantId(v.assistantId ?? DEFAULT_ASSISTANT_ID),
    });
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          ...parsed,
          ...workingMemoryKey(parsed.userId, parsed.assistantId!, parsed.conversationId),
          entityType: 'WORKING_MEMORY',
        },
      }),
    );
  }

  async lastActivityAt(userId: string, limit = 50) {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':prefix': 'WORKING_MEMORY#',
        },
        ConsistentRead: true,
        Limit: limit,
      }),
    );
    return (result.Items ?? []).reduce<string | null>((latest, item) => {
      const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : null;
      return updatedAt && (latest === null || updatedAt > latest) ? updatedAt : latest;
    }, null);
  }

  private async read(Key: { PK: string; SK: string }) {
    const result = await this.client.send(
      new GetCommand({ TableName: this.table, Key, ConsistentRead: true }),
    );
    return result.Item ? schema.parse(fromItem(result.Item)) : null;
  }
}
