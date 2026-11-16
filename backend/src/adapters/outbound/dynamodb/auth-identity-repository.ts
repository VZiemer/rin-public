import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { authIdentitySchema, type AuthIdentity, type AuthProvider } from '../../../domain/model/auth-identity.js';
import { parseUserId } from '../../../domain/model/user-id.js';
import type { AuthIdentityRepository } from '../../../application/ports/auth-identity.js';
import { fromItem } from './mapping.js';
import { authIdentityLookupKey, authIdentityUserKey } from './auth-keys.js';
import type { DocumentClient } from './store.js';

export class DynamoDbAuthIdentityRepository implements AuthIdentityRepository {
  constructor(
    private readonly client: DocumentClient,
    private readonly table: string,
  ) {}

  async findUserId(provider: AuthProvider, issuer: string, subject: string) {
    return (await this.get(provider, issuer, subject))?.userId ?? null;
  }

  async get(provider: AuthProvider, issuer: string, subject: string) {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: authIdentityLookupKey(provider, issuer, subject),
        ConsistentRead: true,
      }),
    );
    return result.Item ? authIdentitySchema.parse(fromItem(result.Item)) : null;
  }

  async create(identity: AuthIdentity) {
    const parsed = authIdentitySchema.parse(identity);
    const lookup = authIdentityLookupKey(parsed.provider, parsed.issuer, parsed.subject);
    const reverse = authIdentityUserKey(parsed.userId, parsed.provider, parsed.issuer, parsed.subject);
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: { ...parsed, ...lookup, entityType: 'AUTH_IDENTITY' },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: { ...parsed, ...reverse, entityType: 'AUTH_IDENTITY' },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'TransactionCanceledException') return false;
      throw error;
    }
  }

  async listByUserId(userId: string) {
    const parsed = parseUserId(userId);
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${parsed}`,
          ':prefix': 'AUTH_IDENTITY#',
        },
        ConsistentRead: true,
      }),
    );
    return (result.Items ?? []).map((item) => authIdentitySchema.parse(fromItem(item)));
  }
}
