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
} from '../../domain/model/contracts.js';
export interface SingletonRepository<T> {
  get(userId: string): Promise<T | null>;
  put(value: T, mode?: 'insert-missing' | 'overwrite'): Promise<boolean>;
}
export type PersonaRepository = SingletonRepository<Persona>;
export type UserProfileRepository = SingletonRepository<UserProfile>;
export interface RelationshipRepository {
  get(userId: string, assistantId?: string): Promise<RelationshipConfig | null>;
  put(value: RelationshipConfig, mode?: 'insert-missing' | 'overwrite'): Promise<boolean>;
}
export type RoutineRepository = SingletonRepository<Routine>;
export type RinLiveStateRepository = SingletonRepository<RinLiveState>;
export type RinPreferencesRepository = SingletonRepository<RinPreferences>;
export type RinWorldContextRepository = SingletonRepository<RinWorldContext>;
export interface PersonRepository {
  get(userId: string, id: string): Promise<PersonRelationship | null>;
  list(userId: string, limit?: number): Promise<PersonRelationship[]>;
  put(value: PersonRelationship, mode?: 'insert-missing' | 'overwrite'): Promise<boolean>;
}
export interface ShoppingItemRepository {
  get(userId: string, id: string): Promise<ShoppingItem | null>;
  list(userId: string, limit?: number): Promise<ShoppingItem[]>;
  create(item: ShoppingItem): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
}
export interface RinEpisodeRepository {
  get(userId: string, id: string): Promise<RinEpisode | null>;
  list(userId: string, limit?: number): Promise<RinEpisode[]>;
  put(value: RinEpisode, mode?: 'insert-missing' | 'overwrite'): Promise<boolean>;
}
