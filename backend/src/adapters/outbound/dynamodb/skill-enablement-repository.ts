import { z } from 'zod';
import type {
  SkillEnablementRecord,
  SkillEnablementRepository,
} from '../../../application/ports/skill-enablement.js';
import { skillEnablementId } from '../../../application/ports/skill-enablement.js';
import { skillIds, type SkillId } from '../../../domain/skills/definition.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';

const schema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  skillId: z.enum(skillIds),
  enabled: z.boolean(),
});

export class DynamoDbSkillEnablementRepository implements SkillEnablementRepository {
  private readonly store: DynamoStore<SkillEnablementRecord>;

  constructor(client: DocumentClient, table: string) {
    this.store = new DynamoStore(client, table, 'SKILL_ENABLEMENT', schema);
  }

  get(userId: string, assistantId: string, skillId: SkillId) {
    return this.store.get(userId, skillEnablementId(assistantId, skillId));
  }

  async put(record: SkillEnablementRecord) {
    const id = skillEnablementId(record.assistantId, record.skillId);
    await this.store.put({ ...record, id }, id);
  }

  async list(userId: string, assistantId: string) {
    const records = await this.store.list(userId, 50);
    return records.filter((record) => record.assistantId === assistantId);
  }
}
