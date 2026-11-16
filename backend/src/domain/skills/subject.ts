import type { OwnedEntity } from '../model/contracts.js';
import type { SkillId } from './definition.js';

export const SUBJECT_TTL_MS = 6 * 60 * 60 * 1000;

export interface SubjectAnchor {
  skillId: Exclude<SkillId, 'conversation'>;
  ref: string;
  at: string;
}

export interface ActiveSubject extends OwnedEntity {
  id: string;
  assistantId: string;
  conversationId: string;
  primary: SkillId;
  secondary?: SkillId | undefined;
  reason: 'explicit' | 'inferred' | 'continued' | 'reference';
  expiresAt: string;
}

export interface SkillSelection {
  primary: SkillId;
  secondary?: SkillId | undefined;
  reason: ActiveSubject['reason'];
  endedPrevious: boolean;
}

export function subjectId(assistantId: string, conversationId: string): string {
  return `${assistantId}~${conversationId}`;
}

export function subjectExpiry(now: Date): string {
  return new Date(now.getTime() + SUBJECT_TTL_MS).toISOString();
}

export function isSubjectExpired(subject: ActiveSubject, now: Date): boolean {
  return Date.parse(subject.expiresAt) <= now.getTime();
}
