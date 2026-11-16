import type { FollowUp } from '../../domain/skills/follow-up.js';

export interface FollowUpRepository {
  get(userId: string, assistantId: string, id: string): Promise<FollowUp | null>;
  put(followUp: FollowUp): Promise<void>;
  list(userId: string, assistantId: string): Promise<FollowUp[]>;
}
