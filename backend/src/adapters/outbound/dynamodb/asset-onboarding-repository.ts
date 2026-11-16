import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { DocumentClient } from './store.js';
import type { AssetOnboardingRepository } from '../../../application/ports/asset-onboarding.js';
import {
  assetOnboardingSchema,
  type AssetOnboarding,
} from '../../../domain/model/asset-onboarding.js';
import { parseUserId } from '../../../domain/model/user-id.js';
import { assetIdSchema } from '../../../domain/model/rin-assets.js';

export class DynamoDbAssetOnboardingRepository implements AssetOnboardingRepository {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  private key(userId: string, imageName: string) {
    return {
      PK: `USER#${parseUserId(userId)}`,
      SK: `ASSET_ONBOARDING#RIN#${assetIdSchema.parse(imageName)}`,
    };
  }
  private parse(item: Record<string, unknown>) {
    return assetOnboardingSchema.strip().parse(item);
  }
  async get(userId: string, imageName: string) {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: this.key(userId, imageName),
        ConsistentRead: true,
      }),
    );
    return result.Item ? this.parse(result.Item) : null;
  }
  async listOpen(userId: string) {
    const records: AssetOnboarding[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${parseUserId(userId)}`,
            ':prefix': 'ASSET_ONBOARDING#RIN#',
          },
          ConsistentRead: true,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      records.push(
        ...(page.Items ?? [])
          .map((item) => this.parse(item))
          .filter((r) => r.status !== 'completed'),
      );
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return records.sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.image.id.localeCompare(b.image.id),
    );
  }
  async save(record: AssetOnboarding, expectedRevision: number | null) {
    const parsed = assetOnboardingSchema.parse(record);
    const put = {
      TableName: this.table,
      Item: {
        ...parsed,
        ...this.key(parsed.userId, parsed.image.id),
        entityType: 'ASSET_ONBOARDING',
      },
      ConditionExpression:
        expectedRevision === null ? 'attribute_not_exists(PK)' : 'revision = :revision',
      ...(expectedRevision === null
        ? {}
        : { ExpressionAttributeValues: { ':revision': expectedRevision } }),
    };
    try {
      if (expectedRevision === null) {
        await this.client.send(
          new TransactWriteCommand({
            TransactItems: [
              { Put: put },
              {
                Put: {
                  TableName: this.table,
                  Item: {
                    PK: 'ASSISTANT#RIN',
                    SK: `AVATAR_IMAGE#${parsed.image.id}`,
                    entityType: 'AVATAR_IMAGE_IDENTITY',
                    imageName: parsed.image.id,
                    sha256: parsed.image.sha256,
                  },
                  ConditionExpression: 'attribute_not_exists(PK) OR sha256 = :hash',
                  ExpressionAttributeValues: { ':hash': parsed.image.sha256 },
                },
              },
            ],
          }),
        );
      } else await this.client.send(new PutCommand(put));
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return false;
      if (
        error instanceof Error &&
        error.name === 'TransactionCanceledException' &&
        'CancellationReasons' in error &&
        Array.isArray(error.CancellationReasons) &&
        error.CancellationReasons.some(
          (r: unknown) =>
            r && typeof r === 'object' && 'Code' in r && r.Code === 'ConditionalCheckFailed',
        )
      )
        return false;
      throw error;
    }
  }
}
