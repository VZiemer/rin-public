import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  assistantDefinitionSchema,
  type AssistantDefinition,
} from '../../../domain/model/assistant.js';
import { assistantIdSchema } from '../../../domain/model/assistant-id.js';
import type { AssistantRepository } from '../../../application/ports/assistant.js';
import { assistantKey } from './mapping.js';
import type { DocumentClient } from './store.js';

export class DynamoDbAssistantRepository implements AssistantRepository {
  constructor(
    private readonly client: DocumentClient,
    private readonly table: string,
  ) {}

  async getById(assistantId: string) {
    const parsed = assistantIdSchema.safeParse(assistantId);
    if (!parsed.success) return null;
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: assistantKey(parsed.data),
        ConsistentRead: true,
      }),
    );
    return result.Item ? assistantDefinitionSchema.parse(fromAssistantItem(result.Item)) : null;
  }

  async listAvailable() {
    const result: AssistantDefinition[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(
        new ScanCommand({
          TableName: this.table,
          FilterExpression: 'entityType = :type AND enabled = :enabled',
          ExpressionAttributeValues: { ':type': 'ASSISTANT', ':enabled': true },
          ExclusiveStartKey: cursor,
        }),
      );
      result.push(
        ...(page.Items ?? []).map((item) => assistantDefinitionSchema.parse(fromAssistantItem(item))),
      );
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return result.sort((a, b) => a.id.localeCompare(b.id));
  }

  async put(definition: AssistantDefinition) {
    const parsed = assistantDefinitionSchema.parse(definition);
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          ...parsed,
          ...assistantKey(parsed.id),
          entityType: 'ASSISTANT',
        },
      }),
    );
  }
}

function fromAssistantItem(item: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(item).filter(([name]) => !['PK', 'SK', 'entityType'].includes(name)),
  );
}
