import type { SkillThread } from '../skills/proactive-engine.js';

export interface SkillThreadRepository {
  get?(userId: string, assistantId: string, id: string): Promise<SkillThread | null>;
  put(thread: SkillThread): Promise<void>;
  listRecent(userId: string, assistantId: string, limit: number): Promise<SkillThread[]>;
}
