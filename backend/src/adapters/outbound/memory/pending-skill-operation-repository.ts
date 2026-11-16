import type {
  PendingSkillOperation,
  PendingSkillOperationRepository,
} from '../../../application/ports/pending-skill-operation.js';

export class InMemoryPendingSkillOperationRepository implements PendingSkillOperationRepository {
  private readonly records = new Map<string, PendingSkillOperation>();

  async get(userId: string, assistantId: string, id: string) {
    const record = this.records.get(`${userId}#${id}`);
    if (!record || record.assistantId !== assistantId) return null;
    return record;
  }

  async put(operation: PendingSkillOperation) {
    this.records.set(`${operation.userId}#${operation.id}`, operation);
  }

  async listOpen(userId: string, assistantId: string, conversationId: string, now: Date) {
    return [...this.records.values()].filter(
      (operation) =>
        operation.userId === userId &&
        operation.assistantId === assistantId &&
        operation.conversationId === conversationId &&
        operation.status === 'pending' &&
        Date.parse(operation.expiresAt) > now.getTime(),
    );
  }
}
