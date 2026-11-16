import type { OwnedEntity } from '../model/contracts.js';
import type { SkillId } from './definition.js';

export type SkillDomain = 'finance' | 'support';
export type DomainSensitivity = 'financial' | 'emotional' | 'operational';
export type DomainPersistence = 'session' | 'domain' | 'permanent';

export interface DomainRecord extends OwnedEntity {
  id: string;
  assistantId: string;
  domain: SkillDomain;
  sensitivity: DomainSensitivity;
  origin: 'user' | 'skill' | 'system';
  recordedAt: string;
  persist: DomainPersistence;
  expiresAt?: string | undefined;
  consentId?: string | undefined;
  payload: Record<string, string | number | boolean>;
}

export interface ContextProjection {
  skillId: SkillId;
  records: DomainRecord[];
  workingSummary: string | null;
  omitted: Array<'emotional' | 'financial'>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionFor(
  sensitivity: DomainSensitivity,
  now: Date,
): { persist: DomainPersistence; expiresAt?: string } {
  if (sensitivity === 'emotional') {
    return { persist: 'session', expiresAt: new Date(now.getTime() + DAY_MS).toISOString() };
  }
  return { persist: 'domain' };
}

export function emotionalPermanentAllowed(
  record: Pick<DomainRecord, 'sensitivity' | 'persist' | 'consentId'>,
): boolean {
  if (record.sensitivity !== 'emotional' || record.persist !== 'permanent') return true;
  return Boolean(record.consentId);
}
