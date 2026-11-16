import type { ActiveSubjectRepository } from '../../../application/ports/active-subject.js';
import type { ActiveSubject } from '../../../domain/skills/subject.js';
import { subjectId } from '../../../domain/skills/subject.js';

export class InMemoryActiveSubjectRepository implements ActiveSubjectRepository {
  private readonly records = new Map<string, ActiveSubject>();

  async get(userId: string, assistantId: string, conversationId: string) {
    const record = this.records.get(`${userId}#${subjectId(assistantId, conversationId)}`);
    if (!record || record.assistantId !== assistantId || record.userId !== userId) return null;
    return record;
  }

  async put(subject: ActiveSubject) {
    const id = `${subject.userId}#${subjectId(subject.assistantId, subject.conversationId)}`;
    this.records.set(id, subject);
  }
}
