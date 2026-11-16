import { z } from 'zod';
import type {
  PendingSkillOperation,
  PendingSkillOperationRepository,
} from '../../../application/ports/pending-skill-operation.js';
import { skillIds } from '../../../domain/skills/definition.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';

const schema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  conversationId: z.string(),
  skillId: z.enum(skillIds),
  name: z.string(),
  summary: z.string(),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  expiresAt: z.string(),
  status: z.enum(['pending', 'applied', 'rejected']),
});

export class DynamoDbPendingSkillOperationRepository implements PendingSkillOperationRepository {
  private readonly store: DynamoStore<PendingSkillOperation>;

  constructor(client: DocumentClient, table: string) {
    this.store = new DynamoStore(client, table, 'SKILL_OPERATION', schema);
  }

  async get(userId: string, assistantId: string, id: string) {
    const record = await this.store.get(userId, id);
    if (!record || record.assistantId !== assistantId) return null;
    return record;
  }

  async put(operation: PendingSkillOperation) {
    await this.store.put(operation, operation.id);
  }

  async listOpen(userId: string, assistantId: string, conversationId: string, now: Date) {
    const records = await this.store.list(userId, 50);
    return records.filter(
      (operation) =>
        operation.assistantId === assistantId &&
        operation.conversationId === conversationId &&
        operation.status === 'pending' &&
        Date.parse(operation.expiresAt) > now.getTime(),
    );
  }
}
