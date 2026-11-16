import { createHash } from 'node:crypto';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type {
  AssetSelectionRepository,
  AssetSelectionDelivery,
} from '../../../application/ports/rin-assets.js';
import type { Device } from '../../../domain/model/contracts.js';
import type { DocumentClient } from './store.js';
import { parseAssistantId } from '../../../domain/model/assistant-id.js';

const deliverySchema = z.object({
  scope: z.string(),
  refreshedAt: z.iso.datetime(),
  recipient: z.string(),
});
const recipient = (device: Device) =>
  createHash('sha256')
    .update(JSON.stringify([device.userId, device.pushToken]))
    .digest('hex');
export class DynamoDbAssetSelectionRepository implements AssetSelectionRepository {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  private key(assistantId: string, device: Device) {
    return { PK: `DEVICE#${device.id}`, SK: `AVATAR_SYNC#${parseAssistantId(assistantId)}` };
  }
  async get(assistantId: string, device: Device) {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: this.key(assistantId, device),
        ConsistentRead: true,
      }),
    );
    if (!result.Item) return null;
    const delivery = deliverySchema.parse(result.Item);
    return delivery.recipient === recipient(device) ? delivery : null;
  }
  async put(assistantId: string, device: Device, delivery: AssetSelectionDelivery) {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          ...this.key(assistantId, device),
          ...delivery,
          recipient: recipient(device),
          entityType: 'AVATAR_SELECTION_DELIVERY',
        },
      }),
    );
  }
}
