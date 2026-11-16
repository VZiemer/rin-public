import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { DeviceOwnership, DeviceRepository } from '../../../application/ports/device.js';
import type { Device } from '../../../domain/model/contracts.js';
import { deviceOwnershipKey } from './auth-keys.js';
import { key } from './mapping.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';

const schema = owned.extend({
  id: z.string().regex(/^[\w-]{1,128}$/),
  platform: z.literal('android'),
  pushToken: z.string().min(1).max(4096),
  enabled: z.boolean(),
});

const ownershipSchema = z.object({
  deviceId: z.string().regex(/^[\w-]{1,128}$/),
  ownerUserId: z.string().min(1),
  platform: z.literal('android'),
  pushToken: z.string().min(1).max(4096),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export class DynamoDbDeviceRepository implements DeviceRepository {
  private store: DynamoStore<Device>;
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {
    this.store = new DynamoStore(client, table, 'DEVICE', schema);
  }
  get(u: string, id: string) {
    return this.store.get(u, id);
  }
  list(u: string, limit?: number) {
    return this.store.list(u, limit);
  }
  async put(v: Device) {
    await this.claim(v);
  }
  async delete(u: string, id: string) {
    const ownership = await this.getOwnership(id);
    if (ownership && ownership.ownerUserId !== u) return;
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          { Delete: { TableName: this.table, Key: key(u, 'DEVICE', id) } },
          { Delete: { TableName: this.table, Key: deviceOwnershipKey(id) } },
        ],
      }),
    );
  }
  async getOwnership(deviceId: string): Promise<DeviceOwnership | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: deviceOwnershipKey(deviceId),
        ConsistentRead: true,
      }),
    );
    if (!result.Item) return null;
    return ownershipSchema.parse({
      deviceId: result.Item.deviceId ?? result.Item.id,
      ownerUserId: result.Item.ownerUserId ?? result.Item.userId,
      platform: result.Item.platform,
      pushToken: result.Item.pushToken,
      enabled: result.Item.enabled,
      createdAt: result.Item.createdAt,
      updatedAt: result.Item.updatedAt,
    });
  }
  async claim(device: Device) {
    const parsed = schema.parse(device);
    const current = await this.getOwnership(parsed.id);
    const items: Array<Record<string, unknown>> = [
      {
        Put: {
          TableName: this.table,
          Item: {
            ...parsed,
            ...deviceOwnershipKey(parsed.id),
            entityType: 'DEVICE_OWNERSHIP',
            deviceId: parsed.id,
            ownerUserId: parsed.userId,
          },
        },
      },
      {
        Put: {
          TableName: this.table,
          Item: { ...parsed, ...key(parsed.userId, 'DEVICE', parsed.id), entityType: 'DEVICE' },
        },
      },
    ];
    if (current && current.ownerUserId !== parsed.userId) {
      items.unshift({
        Delete: {
          TableName: this.table,
          Key: key(current.ownerUserId, 'DEVICE', parsed.id),
        },
      });
    }
    await this.client.send(new TransactWriteCommand({ TransactItems: items }));
  }
}
