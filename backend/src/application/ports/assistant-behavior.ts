import type {
  AssistantBehavior,
  PersonalityDefinition,
} from '../../domain/model/assistant-behavior.js';

export interface PersonalityRepository {
  get(id: string): Promise<PersonalityDefinition | null>;
  insertMissing(definition: PersonalityDefinition): Promise<void>;
}
export interface BehaviorChange {
  source: 'hipnose' | 'admin';
  field: 'moodScore' | 'intimacyScore' | 'personalityId' | 'diagnosticsEnabled' | 'socialConfig';
  previous: string | number | boolean;
  next: string | number | boolean;
}
export interface AssistantBehaviorRepository {
  get(userId: string, assistantId: string): Promise<AssistantBehavior | null>;
  /** Atomic state update and audit, guarded by the prior version. */
  save(
    state: AssistantBehavior,
    expectedVersion: number | null,
    change: BehaviorChange,
  ): Promise<void>;
}
