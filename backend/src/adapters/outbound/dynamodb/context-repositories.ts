import type {
  Persona,
  UserProfile,
  RelationshipConfig,
  Routine,
  PersonRelationship,
  ShoppingItem,
  RinLiveState,
  RinPreferences,
  RinWorldContext,
  RinEpisode,
  OwnedEntity,
} from '../../../domain/model/contracts.js';
import type {
  SingletonRepository,
  PersonRepository,
  ShoppingItemRepository,
  RinEpisodeRepository,
  RelationshipRepository,
} from '../../../application/ports/context.js';
import { DEFAULT_ASSISTANT_ID, parseAssistantId } from '../../../domain/model/assistant-id.js';
import type { z } from 'zod';
import { DynamoStore, type DocumentClient } from './store.js';
import type { EntityType } from './mapping.js';
import {
  personaSchema,
  profileSchema,
  relationshipSchema,
  routineSchema,
  personSchema,
  shoppingItemSchema,
  rinLiveStateSchema,
  rinPreferencesSchema,
  rinWorldContextSchema,
  rinEpisodeSchema,
} from './schemas.js';
class Singleton<T extends OwnedEntity> implements SingletonRepository<T> {
  private store: DynamoStore<T>;
  constructor(
    client: DocumentClient,
    table: string,
    type: EntityType,
    schema: z.ZodType<T>,
    private id?: string,
  ) {
    this.store = new DynamoStore(client, table, type, schema);
  }
  get(userId: string) {
    return this.store.get(userId, this.id);
  }
  put(value: T, mode: 'insert-missing' | 'overwrite' = 'overwrite') {
    return this.store.put(value, this.id, mode);
  }
}
export class DynamoDbPersonaRepository extends Singleton<Persona> {
  constructor(c: DocumentClient, t: string) {
    super(c, t, 'PERSONA', personaSchema, 'RIN');
  }
}
export class DynamoDbUserProfileRepository extends Singleton<UserProfile> {
  constructor(c: DocumentClient, t: string) {
    super(c, t, 'PROFILE', profileSchema);
  }
}
export class DynamoDbRelationshipRepository implements RelationshipRepository {
  private store: DynamoStore<RelationshipConfig>;
  constructor(c: DocumentClient, t: string) {
    this.store = new DynamoStore(c, t, 'RELATIONSHIP_CONFIG', relationshipSchema);
  }
  get(userId: string, assistantId = DEFAULT_ASSISTANT_ID) {
    return this.store.get(userId, parseAssistantId(assistantId));
  }
  put(value: RelationshipConfig, mode: 'insert-missing' | 'overwrite' = 'overwrite') {
    const assistant = parseAssistantId(value.assistant ?? DEFAULT_ASSISTANT_ID);
    return this.store.put({ ...value, assistant }, assistant, mode);
  }
}
export class DynamoDbRoutineRepository extends Singleton<Routine> {
  constructor(c: DocumentClient, t: string) {
    super(c, t, 'ROUTINE', routineSchema, 'WEEKDAY');
  }
}
export class DynamoDbRinStateRepository extends Singleton<RinLiveState> {
  constructor(c: DocumentClient, t: string) {
    super(c, t, 'RIN_STATE', rinLiveStateSchema);
  }
}
export class DynamoDbRinPreferencesRepository extends Singleton<RinPreferences> {
  constructor(c: DocumentClient, t: string) {
    super(c, t, 'RIN_PREFERENCES', rinPreferencesSchema);
  }
}
export class DynamoDbRinWorldContextRepository extends Singleton<RinWorldContext> {
  constructor(c: DocumentClient, t: string) {
    super(c, t, 'RIN_WORLD_CONTEXT', rinWorldContextSchema);
  }
}
export class DynamoDbRinEpisodeRepository implements RinEpisodeRepository {
  private store: DynamoStore<RinEpisode>;
  constructor(c: DocumentClient, t: string) {
    this.store = new DynamoStore(c, t, 'RIN_EPISODE', rinEpisodeSchema);
  }
  get(u: string, id: string) {
    return this.store.get(u, id);
  }
  list(u: string, limit?: number) {
    return this.store.list(u, limit);
  }
  put(v: RinEpisode, mode: 'insert-missing' | 'overwrite' = 'overwrite') {
    return this.store.put(v, v.id, mode);
  }
}
export class DynamoDbShoppingItemRepository implements ShoppingItemRepository {
  private store: DynamoStore<ShoppingItem>;
  constructor(c: DocumentClient, t: string) {
    this.store = new DynamoStore(c, t, 'SHOPPING#ITEM', shoppingItemSchema);
  }
  get(u: string, id: string) {
    return this.store.get(u, id);
  }
  list(u: string, limit?: number) {
    return this.store.list(u, limit);
  }
  async create(v: ShoppingItem) {
    if (!(await this.store.put(v, v.id, 'insert-missing')))
      throw new Error('Shopping item already exists');
  }
  delete(u: string, id: string) {
    return this.store.delete(u, id);
  }
}
export class DynamoDbPersonRepository implements PersonRepository {
  private store: DynamoStore<PersonRelationship>;
  constructor(c: DocumentClient, t: string) {
    this.store = new DynamoStore(c, t, 'PERSON', personSchema);
  }
  get(u: string, id: string) {
    return this.store.get(u, id);
  }
  list(u: string, limit?: number) {
    return this.store.list(u, limit);
  }
  put(p: PersonRelationship, mode: 'insert-missing' | 'overwrite' = 'overwrite') {
    return this.store.put(p, p.id, mode);
  }
}
