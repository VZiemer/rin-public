import { assistantDefinitionSchema, type AssistantDefinition } from '../../../domain/model/assistant.js';
import { assistantIdSchema } from '../../../domain/model/assistant-id.js';
import type { AssistantRepository } from '../../../application/ports/assistant.js';

export class InMemoryAssistantRepository implements AssistantRepository {
  constructor(private readonly items = new Map<string, AssistantDefinition>()) {}

  async getById(assistantId: string) {
    const parsed = assistantIdSchema.safeParse(assistantId);
    if (!parsed.success) return null;
    return this.items.get(parsed.data) ?? null;
  }

  async listAvailable() {
    return [...this.items.values()].filter((assistant) => assistant.enabled);
  }

  async put(definition: AssistantDefinition) {
    const parsed = assistantDefinitionSchema.parse(definition);
    this.items.set(parsed.id, parsed);
  }
}
