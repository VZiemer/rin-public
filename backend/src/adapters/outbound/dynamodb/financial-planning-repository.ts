import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DocumentClient } from './store.js';
import type { FinancialPlanningRepository } from '../../../application/ports/financial-planning.js';
import {
  debtSchema,
  planRecordSchema,
  type Debt,
  type PlanRecord,
} from '../../../domain/finance/planning.js';
import { statementJobSchema, type StatementJob } from '../../../domain/finance/statement.js';
import { parseAssistantId } from '../../../domain/model/assistant-id.js';
import { z } from 'zod';

export class DynamoDbFinancialPlanningRepository implements FinancialPlanningRepository {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  private key(userId: string, assistant: string, suffix: string) {
    z.string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .parse(userId);
    return {
      PK: `USER#${userId}`,
      SK: `FINANCIAL_PLANNING#${parseAssistantId(assistant)}#${suffix}`,
    };
  }
  private async get(user: string, assistant: string, suffix: string) {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: this.key(user, assistant, suffix),
        ConsistentRead: true,
      }),
    );
    return result.Item?.data as unknown;
  }
  private async put(
    user: string,
    assistant: string,
    suffix: string,
    data: unknown,
    revision?: number | null,
  ) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: {
            ...this.key(user, assistant, suffix),
            data,
            ...(suffix.startsWith('IMPORT#')
              ? { expiresAt: Math.floor(Date.now() / 1000) + 30 * 86400 }
              : {}),
            ...(revision !== undefined ? { revision: (revision ?? -1) + 1 } : {}),
          },
          ...(revision === undefined
            ? {}
            : revision === null
              ? { ConditionExpression: 'attribute_not_exists(PK)' }
              : {
                  ConditionExpression: 'revision = :revision',
                  ExpressionAttributeValues: { ':revision': revision },
                }),
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }
  async getPlan(user: string, assistant: string) {
    const data = await this.get(user, assistant, 'PLAN');
    return data ? planRecordSchema.parse(data) : null;
  }
  savePlan(record: PlanRecord, expected: number | null) {
    const valid = planRecordSchema.parse(record);
    if (valid.revision !== (expected ?? -1) + 1) throw new Error('Invalid plan revision');
    return this.put(valid.userId, valid.assistantId, 'PLAN', valid, expected);
  }
  async listDebts(user: string, assistant: string) {
    const results: Debt[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': this.key(user, assistant, '').PK,
            ':sk': this.key(user, assistant, 'DEBT#').SK,
          },
          ConsistentRead: true,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      results.push(...(page.Items ?? []).map((item) => debtSchema.parse(item.data)));
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return results;
  }
  async saveDebt(user: string, assistant: string, debt: Debt) {
    const valid = debtSchema.parse(debt);
    await this.put(user, assistant, `DEBT#${valid.id}`, valid);
  }
  async getStatement(user: string, assistant: string, id: string) {
    z.string().uuid().parse(id);
    const data = await this.get(user, assistant, `IMPORT#${id}`);
    return data ? statementJobSchema.parse(data) : null;
  }
  saveStatement(job: StatementJob, expected: number | null) {
    const valid = statementJobSchema.parse(job);
    if (valid.revision !== (expected ?? -1) + 1) throw new Error('Invalid import revision');
    return this.put(job.userId, job.assistantId, `IMPORT#${job.id}`, valid, expected);
  }
}
