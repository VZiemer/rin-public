import type {
  SkillEnablementRecord,
  SkillEnablementRepository,
} from '../../../application/ports/skill-enablement.js';
import { skillEnablementId } from '../../../application/ports/skill-enablement.js';
import type { SkillId } from '../../../domain/skills/definition.js';

export class InMemorySkillEnablementRepository implements SkillEnablementRepository {
  private readonly records = new Map<string, SkillEnablementRecord>();

  async get(userId: string, assistantId: string, skillId: SkillId) {
    return this.records.get(this.key(userId, assistantId, skillId)) ?? null;
  }

  async put(record: SkillEnablementRecord) {
    this.records.set(this.key(record.userId, record.assistantId, record.skillId), record);
  }

  async list(userId: string, assistantId: string) {
    return [...this.records.values()].filter(
      (record) => record.userId === userId && record.assistantId === assistantId,
    );
  }

  private key(userId: string, assistantId: string, skillId: SkillId) {
    return `${userId}#${skillEnablementId(assistantId, skillId)}`;
  }
}
