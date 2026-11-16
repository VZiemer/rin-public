import { randomUUID } from 'node:crypto';
import { PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type {
  RinInitiativeStore,
  RinLogRepository,
  RinLogType,
  TickUserSource,
} from '../../../application/ports/tick.js';
import { key } from './mapping.js';
import type { DocumentClient } from './store.js';

export class DynamoDbRinInitiativeStore implements RinInitiativeStore {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  async saveInitiative(userId: string, initiative: Record<string, unknown>, now: Date) {
    const ts = now.toISOString();
    await this.client.send(
      new UpdateCommand({
        TableName: this.table,
        Key: key(userId, 'RIN_STATE'),
        UpdateExpression:
          'SET initiative = :initiative, mood = if_not_exists(mood, :mood), updatedAt = :updatedAt, entityType = :entityType, userId = :userId, createdAt = if_not_exists(createdAt, :createdAt)',
        ExpressionAttributeValues: {
          ':initiative': initiative,
          ':mood': {},
          ':updatedAt': ts,
          ':entityType': 'RIN_STATE',
          ':userId': userId,
          ':createdAt': ts,
        },
      }),
    );
  }
}

export class DynamoDbTickUserSource implements TickUserSource {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  async listUserIdsWithDevices() {
    const users = new Set<string>();
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(
        new ScanCommand({
          TableName: this.table,
          FilterExpression: 'entityType = :type AND enabled = :enabled',
          ProjectionExpression: 'ownerUserId',
          ExpressionAttributeValues: { ':type': 'DEVICE_OWNERSHIP', ':enabled': true },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of page.Items ?? []) {
        const owner = item.ownerUserId;
        if (typeof owner === 'string' && /^[\w-]+$/.test(owner)) users.add(owner);
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return [...users];
  }
}

export class DynamoDbRinLogRepository implements RinLogRepository {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  async append(type: RinLogType, userId: string, payload: Record<string, unknown>, now: Date) {
    if (!userId || userId.includes('#')) throw new Error('Invalid log user id');
    const ts = now.toISOString();
    const id = `${ts}#${randomUUID()}`;
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          PK: `USER#${userId}`,
          SK: `${type}#${id}`,
          entityType: type,
          id,
          userId,
          ...payload,
          createdAt: ts,
          updatedAt: ts,
        },
      }),
    );
  }
}
