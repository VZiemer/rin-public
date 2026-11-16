import type { OwnedEntity } from '../../domain/model/contracts.js';
import type { SkillId } from '../../domain/skills/definition.js';

export interface SkillEnablementRecord extends OwnedEntity {
  id: string;
  assistantId: string;
  skillId: SkillId;
  enabled: boolean;
}

export interface SkillEnablementRepository {
  get(
    userId: string,
    assistantId: string,
    skillId: SkillId,
  ): Promise<SkillEnablementRecord | null>;
  put(record: SkillEnablementRecord): Promise<void>;
  list(userId: string, assistantId: string): Promise<SkillEnablementRecord[]>;
}

export function skillEnablementId(assistantId: string, skillId: SkillId): string {
  return `${assistantId}~${skillId}`;
}
