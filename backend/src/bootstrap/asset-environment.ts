import { WorldAssetEnvironment } from '../application/assets/environment.js';
import { DynamoDbWorldSettingsRepository } from '../adapters/outbound/dynamodb/world-repository.js';
import {
  DynamoDbRinWorldContextRepository,
  DynamoDbRinStateRepository,
} from '../adapters/outbound/dynamodb/context-repositories.js';
import type { DocumentClient } from '../adapters/outbound/dynamodb/store.js';
import { DynamoDbAssistantBehaviorRepository } from '../adapters/outbound/dynamodb/assistant-behavior-repository.js';

export function assetEnvironment(client: DocumentClient, table: string, timezone: string) {
  return new WorldAssetEnvironment(
    new DynamoDbWorldSettingsRepository(client, table),
    new DynamoDbRinWorldContextRepository(client, table),
    new DynamoDbRinStateRepository(client, table),
    timezone,
    new DynamoDbAssistantBehaviorRepository(client, table),
  );
}
