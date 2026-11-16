import { randomUUID } from 'node:crypto';
import { GetCommand, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  assistantBehaviorSchema,
  personalityDefinitionSchema,
  personalityIdSchema,
  type AssistantBehavior,
  type PersonalityDefinition,
} from '../../../domain/model/assistant-behavior.js';
import { assistantIdSchema } from '../../../domain/model/assistant-id.js';
import type {
  AssistantBehaviorRepository,
  BehaviorChange,
  PersonalityRepository,
} from '../../../application/ports/assistant-behavior.js';
import { AppError } from '../../../domain/errors/app-error.js';
import type { DocumentClient } from './store.js';

function behaviorKey(userId: string, assistantId: string) {
  if (!userId || userId.includes('#')) throw new Error('Invalid behavior owner');
  return { PK: `USER#${userId}`, SK: `ASSISTANT_BEHAVIOR#${assistantIdSchema.parse(assistantId)}` };
}
function data(item: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(item).filter(([key]) => !['PK', 'SK', 'entityType'].includes(key)),
  );
}
export class DynamoDbPersonalityRepository implements PersonalityRepository {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  async get(id: string) {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: `PERSONALITY#${personalityIdSchema.parse(id)}`, SK: 'CONFIG' },
        ConsistentRead: true,
      }),
    );
    return result.Item ? personalityDefinitionSchema.parse(data(result.Item)) : null;
  }
  async insertMissing(definition: PersonalityDefinition) {
    const valid = personalityDefinitionSchema.parse(definition);
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            ...valid,
            PK: `PERSONALITY#${valid.id}`,
            SK: 'CONFIG',
            entityType: 'PERSONALITY',
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'ConditionalCheckFailedException')
        throw error;
    }
  }
}
export class DynamoDbAssistantBehaviorRepository implements AssistantBehaviorRepository {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  async get(userId: string, assistantId: string) {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: behaviorKey(userId, assistantId),
        ConsistentRead: true,
      }),
    );
    return result.Item ? assistantBehaviorSchema.parse(data(result.Item)) : null;
  }
  async save(state: AssistantBehavior, expectedVersion: number | null, change: BehaviorChange) {
    const valid = assistantBehaviorSchema.parse(state);
    if (valid.version !== (expectedVersion ?? 0) + 1) throw new Error('Invalid behavior version');
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: {
                  ...valid,
                  ...behaviorKey(valid.userId, valid.assistantId),
                  entityType: 'ASSISTANT_BEHAVIOR',
                },
                ConditionExpression:
                  expectedVersion === null ? 'attribute_not_exists(PK)' : '#version = :expected',
                ...(expectedVersion === null
                  ? {}
                  : {
                      ExpressionAttributeNames: { '#version': 'version' },
                      ExpressionAttributeValues: { ':expected': expectedVersion },
                    }),
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: {
                  PK: `USER#${valid.userId}`,
                  SK: `BEHAVIOR_AUDIT#${valid.assistantId}#${valid.updatedAt}#${randomUUID()}`,
                  entityType: 'BEHAVIOR_AUDIT',
                  userId: valid.userId,
                  assistantId: valid.assistantId,
                  version: valid.version,
                  createdAt: valid.updatedAt,
                  ...change,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'TransactionCanceledException')
        throw new AppError('behavior_conflict', 409);
      throw error;
    }
  }
}
