import type { OwnedEntity } from '../model/contracts.js';
import type { SkillId } from './definition.js';

export type FollowUpKind = 'suggestion' | 'commitment' | 'task' | 'reminder';
export type FollowUpStatus =
  'suggested' | 'accepted' | 'completed' | 'postponed' | 'cancelled' | 'refused';

export interface FollowUp extends OwnedEntity {
  id: string;
  assistantId: string;
  skillId: SkillId;
  origin: 'user_request' | 'suggestion';
  subject: string;
  nextStep: string;
  authorization: 'none' | 'accepted' | 'refused';
  windowStart?: string | undefined;
  windowEnd?: string | undefined;
  status: FollowUpStatus;
  kind: FollowUpKind;
  lastApproachAt?: string | undefined;
  supportConsentId?: string | undefined;
}

export function canApproach(followUp: FollowUp, now: Date): boolean {
  if (followUp.origin !== 'user_request' || followUp.authorization !== 'accepted') return false;
  if (followUp.status === 'postponed') {
    if (!followUp.windowStart || Date.parse(followUp.windowStart) > now.getTime()) return false;
  } else if (followUp.status !== 'accepted') return false;
  if (followUp.windowStart && Date.parse(followUp.windowStart) > now.getTime()) return false;
  if (followUp.windowEnd && Date.parse(followUp.windowEnd) < now.getTime()) return false;
  return true;
}
