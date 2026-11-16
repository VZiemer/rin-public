import type { SkillThreadRepository } from '../../../application/ports/skill-thread.js';
import type { SkillThread } from '../../../application/skills/proactive-engine.js';

export class InMemorySkillThreadRepository implements SkillThreadRepository {
  private readonly records: SkillThread[] = [];

  async put(thread: SkillThread) {
    const index = this.records.findIndex(
      (item) => item.userId === thread.userId && item.id === thread.id,
    );
    if (index >= 0) this.records[index] = thread;
    else this.records.push(thread);
  }

  async get(userId: string, assistantId: string, id: string) {
    return (
      this.records.find(
        (thread) =>
          thread.userId === userId && thread.assistantId === assistantId && thread.id === id,
      ) ?? null
    );
  }

  async listRecent(userId: string, assistantId: string, limit: number) {
    return this.records
      .filter((thread) => thread.userId === userId && thread.assistantId === assistantId)
      .sort((a, b) => (b.sentAt ?? b.updatedAt).localeCompare(a.sentAt ?? a.updatedAt))
      .slice(0, limit);
  }
}
