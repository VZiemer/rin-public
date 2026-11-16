import { z } from 'zod';
import type { DomainRecordRepository } from '../../../application/ports/domain-record.js';
import type { DomainRecord, SkillDomain } from '../../../domain/skills/domain-record.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';

const schema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  domain: z.enum(['finance', 'support']),
  sensitivity: z.enum(['financial', 'emotional', 'operational']),
  origin: z.enum(['user', 'skill', 'system']),
  recordedAt: z.string(),
  persist: z.enum(['session', 'domain', 'permanent']),
  expiresAt: z.string().optional(),
  consentId: z.string().optional(),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

export class DynamoDbDomainRecordRepository implements DomainRecordRepository {
  private readonly store: DynamoStore<DomainRecord>;

  constructor(client: DocumentClient, table: string) {
    this.store = new DynamoStore(client, table, 'DOMAIN_RECORD', schema);
  }

  async get(userId: string, assistantId: string, id: string) {
    const record = await this.store.get(userId, id);
    if (!record || record.assistantId !== assistantId) return null;
    return record;
  }

  async put(record: DomainRecord) {
    await this.store.put(record, record.id);
  }

  async list(userId: string, assistantId: string, domain?: SkillDomain) {
    const records = await this.store.list(userId, 200);
    return records.filter(
      (record) =>
        record.assistantId === assistantId && (domain === undefined || record.domain === domain),
    );
  }

  async delete(userId: string, assistantId: string, id: string) {
    const record = await this.get(userId, assistantId, id);
    if (record) await this.store.delete(userId, id);
  }

  async deleteDomain(userId: string, assistantId: string, domain: SkillDomain) {
    const records = await this.list(userId, assistantId, domain);
    for (const record of records) await this.store.delete(userId, record.id);
    return records.length;
  }
}
