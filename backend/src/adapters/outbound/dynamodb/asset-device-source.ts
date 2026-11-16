import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { DocumentClient } from './store.js';
import type { AssetDeviceSource } from '../../../application/ports/rin-assets.js';

const ownershipSchema = z.object({
  deviceId: z.string().regex(/^[\w-]{1,128}$/),
  ownerUserId: z.string().min(1),
  platform: z.literal('android'),
  pushToken: z.string().min(1).max(4096),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export class DynamoDbAssetDeviceSource implements AssetDeviceSource {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  async *listEnabled() {
    let cursor: Record<string, unknown> | undefined;
    const fields = [
      'deviceId',
      'ownerUserId',
      'platform',
      'pushToken',
      'enabled',
      'createdAt',
      'updatedAt',
    ];
    do {
      const page = await this.client.send(
        new ScanCommand({
          TableName: this.table,
          FilterExpression: '#entityType = :type AND #enabled = :enabled',
          ProjectionExpression: fields.map((field) => `#${field}`).join(', '),
          ExpressionAttributeNames: {
            '#entityType': 'entityType',
            ...Object.fromEntries(fields.map((field) => [`#${field}`, field])),
          },
          ExpressionAttributeValues: { ':type': 'DEVICE_OWNERSHIP', ':enabled': true },
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      for (const item of page.Items ?? []) {
        const owner = ownershipSchema.parse(item);
        yield {
          id: owner.deviceId,
          userId: owner.ownerUserId,
          platform: owner.platform,
          pushToken: owner.pushToken,
          enabled: owner.enabled,
          createdAt: owner.createdAt,
          updatedAt: owner.updatedAt,
        };
      }
      cursor = page.LastEvaluatedKey;
    } while (cursor);
  }
}
