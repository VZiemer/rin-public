import { AppError } from '../../domain/errors/app-error.js';
import type { SkillActivation, SkillId } from '../../domain/skills/definition.js';
import {
  skillEnablementId,
  type SkillEnablementRecord,
  type SkillEnablementRepository,
} from '../ports/skill-enablement.js';
import type { SkillRegistry } from './registry.js';

export class SkillEnablement {
  constructor(
    private readonly registry: SkillRegistry,
    private readonly repo: SkillEnablementRepository,
  ) {}

  async resolve(userId: string, assistantId: string, skillId: SkillId): Promise<SkillActivation> {
    const definition = this.registry.get(skillId);
    const record = await this.repo.get(userId, assistantId, skillId);
    return this.registry.activation(
      definition,
      userId,
      assistantId,
      record ? { enabled: record.enabled } : null,
    );
  }

  async setEnabled(
    userId: string,
    assistantId: string,
    skillId: SkillId,
    enabled: boolean,
    now: Date,
  ): Promise<SkillEnablementRecord> {
    if (skillId === 'conversation' && !enabled) throw new AppError('skill_required', 409);
    this.registry.get(skillId);
    const existing = await this.repo.get(userId, assistantId, skillId);
    const record: SkillEnablementRecord = {
      id: skillEnablementId(assistantId, skillId),
      userId,
      assistantId,
      skillId,
      enabled,
      createdAt: existing?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.repo.put(record);
    return record;
  }
}
