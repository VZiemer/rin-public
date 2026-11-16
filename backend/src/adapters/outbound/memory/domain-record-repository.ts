import type { DomainRecordRepository } from '../../../application/ports/domain-record.js';
import type { DomainRecord, SkillDomain } from '../../../domain/skills/domain-record.js';

export class InMemoryDomainRecordRepository implements DomainRecordRepository {
  private readonly records = new Map<string, DomainRecord>();

  async get(userId: string, assistantId: string, id: string) {
    const record = this.records.get(this.key(userId, id));
    if (!record || record.assistantId !== assistantId) return null;
    return record;
  }

  async put(record: DomainRecord) {
    this.records.set(this.key(record.userId, record.id), record);
  }

  async list(userId: string, assistantId: string, domain?: SkillDomain) {
    return [...this.records.values()].filter(
      (record) =>
        record.userId === userId &&
        record.assistantId === assistantId &&
        (domain === undefined || record.domain === domain),
    );
  }

  async delete(userId: string, assistantId: string, id: string) {
    const record = await this.get(userId, assistantId, id);
    if (record) this.records.delete(this.key(userId, id));
  }

  async deleteDomain(userId: string, assistantId: string, domain: SkillDomain) {
    const matches = await this.list(userId, assistantId, domain);
    for (const record of matches) this.records.delete(this.key(userId, record.id));
    return matches.length;
  }

  private key(userId: string, id: string) {
    return `${userId}#${id}`;
  }
}
