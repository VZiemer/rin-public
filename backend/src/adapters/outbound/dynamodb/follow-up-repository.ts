import { z } from 'zod';
import type { FollowUpRepository } from '../../../application/ports/follow-up.js';
import { skillIds } from '../../../domain/skills/definition.js';
import type { FollowUp } from '../../../domain/skills/follow-up.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';

const schema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  skillId: z.enum(skillIds),
  origin: z.enum(['user_request', 'suggestion']),
  subject: z.string(),
  nextStep: z.string(),
  authorization: z.enum(['none', 'accepted', 'refused']),
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
  status: z.enum(['suggested', 'accepted', 'completed', 'postponed', 'cancelled', 'refused']),
  kind: z.enum(['suggestion', 'commitment', 'task', 'reminder']),
  lastApproachAt: z.string().optional(),
  supportConsentId: z.string().optional(),
});

export class DynamoDbFollowUpRepository implements FollowUpRepository {
  private readonly store: DynamoStore<FollowUp>;

  constructor(client: DocumentClient, table: string) {
    this.store = new DynamoStore(client, table, 'FOLLOW_UP', schema);
  }

  async get(userId: string, assistantId: string, id: string) {
    const record = await this.store.get(userId, id);
    if (!record || record.assistantId !== assistantId) return null;
    return record;
  }

  put(followUp: FollowUp) {
    return this.store.put(followUp, followUp.id).then(() => undefined);
  }

  async list(userId: string, assistantId: string) {
    const records = await this.store.list(userId, 100);
    return records.filter((followUp) => followUp.assistantId === assistantId);
  }
}
