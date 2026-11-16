import { AppError } from '../../domain/errors/app-error.js';
import type { SkillActivation, SkillDefinition, SkillId } from '../../domain/skills/definition.js';

export class SkillRegistry {
  private readonly definitions = new Map<SkillId, SkillDefinition>();

  register(definition: SkillDefinition): void {
    if (this.definitions.has(definition.id)) throw new Error('Duplicate skill');
    if (definition.fallbackSkillId !== 'conversation') throw new Error('Invalid skill fallback');
    this.definitions.set(definition.id, definition);
  }

  get(id: SkillId): SkillDefinition {
    const definition = this.definitions.get(id);
    if (!definition) throw new AppError('unknown_skill', 404);
    return definition;
  }

  list(): SkillDefinition[] {
    return [...this.definitions.values()];
  }

  activation(
    definition: SkillDefinition,
    userId: string,
    assistantId: string,
    override: { enabled: boolean } | null,
  ): SkillActivation {
    if (definition.id === 'conversation') {
      return {
        userId,
        assistantId,
        skillId: definition.id,
        enabled: true,
        source: override ? 'user' : 'default',
      };
    }
    return {
      userId,
      assistantId,
      skillId: definition.id,
      enabled: override ? override.enabled : definition.defaultEnabled,
      source: override ? 'user' : 'default',
    };
  }

  assertExecutable(activation: SkillActivation): void {
    if (!activation.enabled) throw new AppError('skill_disabled', 403);
    if (!this.definitions.has(activation.skillId)) throw new AppError('unknown_skill', 404);
  }
}
