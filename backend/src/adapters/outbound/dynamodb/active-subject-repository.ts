import { z } from 'zod';
import type { ActiveSubjectRepository } from '../../../application/ports/active-subject.js';
import type { ActiveSubject } from '../../../domain/skills/subject.js';
import { subjectId } from '../../../domain/skills/subject.js';
import { skillIds } from '../../../domain/skills/definition.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';

const schema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  conversationId: z.string(),
  primary: z.enum(skillIds),
  secondary: z.enum(skillIds).optional(),
  reason: z.enum(['explicit', 'inferred', 'continued', 'reference']),
  expiresAt: z.string(),
});

export class DynamoDbActiveSubjectRepository implements ActiveSubjectRepository {
  private readonly store: DynamoStore<ActiveSubject>;

  constructor(client: DocumentClient, table: string) {
    this.store = new DynamoStore(client, table, 'ACTIVE_SUBJECT', schema);
  }

  async get(userId: string, assistantId: string, conversationId: string) {
    const record = await this.store.get(userId, subjectId(assistantId, conversationId));
    if (!record || record.assistantId !== assistantId || record.conversationId !== conversationId) {
      return null;
    }
    return record;
  }

  async put(subject: ActiveSubject) {
    const id = subjectId(subject.assistantId, subject.conversationId);
    await this.store.put({ ...subject, id }, id);
  }
}
