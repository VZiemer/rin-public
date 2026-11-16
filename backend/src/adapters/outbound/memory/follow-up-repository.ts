import type { FollowUpRepository } from '../../../application/ports/follow-up.js';
import type { FollowUp } from '../../../domain/skills/follow-up.js';

export class InMemoryFollowUpRepository implements FollowUpRepository {
  private readonly records = new Map<string, FollowUp>();

  async get(userId: string, assistantId: string, id: string) {
    const record = this.records.get(`${userId}#${id}`);
    if (!record || record.assistantId !== assistantId) return null;
    return record;
  }

  async put(followUp: FollowUp) {
    this.records.set(`${followUp.userId}#${followUp.id}`, followUp);
  }

  async list(userId: string, assistantId: string) {
    return [...this.records.values()].filter(
      (followUp) => followUp.userId === userId && followUp.assistantId === assistantId,
    );
  }
}
