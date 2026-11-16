import type { ActiveSubject } from '../../domain/skills/subject.js';

export interface ActiveSubjectRepository {
  get(userId: string, assistantId: string, conversationId: string): Promise<ActiveSubject | null>;
  put(subject: ActiveSubject): Promise<void>;
}
