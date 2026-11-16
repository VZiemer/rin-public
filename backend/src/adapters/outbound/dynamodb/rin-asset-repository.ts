import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { DocumentClient } from './store.js';
import type { RinAssetCatalogRepository } from '../../../application/ports/rin-assets.js';
import { rinAssetCatalogSchema, type RinAssetCatalog } from '../../../domain/model/rin-assets.js';
import { AppError } from '../../../domain/errors/app-error.js';
import { parseAssistantId } from '../../../domain/model/assistant-id.js';

export class DynamoDbRinAssetCatalogRepository implements RinAssetCatalogRepository {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  async get(assistantId: string) {
    const id = parseAssistantId(assistantId);
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: { PK: `ASSISTANT#${id}`, SK: 'RIN_ASSET_CATALOG' },
        ConsistentRead: true,
      }),
    );
    return result.Item ? rinAssetCatalogSchema.parse(result.Item) : null;
  }
  async publish(catalog: RinAssetCatalog, expectedVersion: string | null) {
    const parsed = rinAssetCatalogSchema.parse(catalog);
    // Permanent name reservations survive catalog removal and failed publication attempts.
    // Separate bounded transactions support catalogs larger than DynamoDB's 100-item limit.
    const images = parsed.sets.flatMap((set) => set.images);
    for (let offset = 0; offset < images.length; offset += 100) {
      try {
        await this.client.send(
          new TransactWriteCommand({
            TransactItems: images.slice(offset, offset + 100).map((image) => ({
              Put: {
                TableName: this.table,
                Item: {
                  PK: `ASSISTANT#${parsed.assistantId}`,
                  SK: `AVATAR_IMAGE#${image.id}`,
                  entityType: 'AVATAR_IMAGE_IDENTITY',
                  imageName: image.id,
                  sha256: image.sha256,
                },
                ConditionExpression: 'attribute_not_exists(PK) OR sha256 = :hash',
                ExpressionAttributeValues: { ':hash': image.sha256 },
              },
            })),
          }),
        );
      } catch (error) {
        if (conditionalFailure(error)) throw new AppError('asset_image_name_conflict', 409);
        throw error;
      }
    }
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: {
                  ...parsed,
                  PK: `ASSISTANT#${parsed.assistantId}`,
                  SK: 'RIN_ASSET_CATALOG',
                  entityType: 'RIN_ASSET_CATALOG',
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
                  ...parsed,
                  PK: `ASSISTANT#${parsed.assistantId}`,
                  SK: `RIN_ASSET_CATALOG#${parsed.version}`,
                  entityType: 'RIN_ASSET_CATALOG_VERSION',
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (conditionalFailure(error)) throw new AppError('asset_catalog_version_conflict', 409);
      throw error;
    }
  }
}
function conditionalFailure(error: unknown) {
  return (
    error instanceof Error &&
    error.name === 'TransactionCanceledException' &&
    'CancellationReasons' in error &&
    Array.isArray(error.CancellationReasons) &&
    error.CancellationReasons.some(
      (reason: unknown) =>
        reason &&
        typeof reason === 'object' &&
        'Code' in reason &&
        reason.Code === 'ConditionalCheckFailed',
    )
  );
}
