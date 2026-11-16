import type { AssistantDefinition } from '../../domain/model/assistant.js';

export interface AssistantRepository {
  getById(assistantId: string): Promise<AssistantDefinition | null>;
  listAvailable(): Promise<AssistantDefinition[]>;
  put(definition: AssistantDefinition): Promise<void>;
}
