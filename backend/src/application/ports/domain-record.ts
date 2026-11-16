import type { DomainRecord, SkillDomain } from '../../domain/skills/domain-record.js';

export interface DomainRecordRepository {
  get(userId: string, assistantId: string, id: string): Promise<DomainRecord | null>;
  put(record: DomainRecord): Promise<void>;
  list(userId: string, assistantId: string, domain?: SkillDomain): Promise<DomainRecord[]>;
  delete(userId: string, assistantId: string, id: string): Promise<void>;
  deleteDomain(userId: string, assistantId: string, domain: SkillDomain): Promise<number>;
}
