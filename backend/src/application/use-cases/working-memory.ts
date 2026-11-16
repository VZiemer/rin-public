import type { WorkingMemoryRepository } from '../ports/memory.js';
import type { Clock } from '../ports/runtime.js';
import { DEFAULT_ASSISTANT_ID, parseAssistantId } from '../../domain/model/assistant-id.js';
export interface WorkingMemorySummarizer {
  summarize(previous: string, message: string, reply: string): Promise<string>;
}
export class UpdateWorkingMemory {
  constructor(
    private repo: WorkingMemoryRepository,
    // Kept as an injection-compatible argument. Recent context must never wait for an LLM summary.
    _summarizer: WorkingMemorySummarizer,
    private clock: Clock,
    private ttlSeconds = 86400,
  ) {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) throw new Error('Invalid memory TTL');
  }
  async execute(
    userId: string,
    conversationId: string,
    message: string,
    reply: string,
    assistantId?: string,
  ) {
    const scopedAssistantId = parseAssistantId(assistantId ?? DEFAULT_ASSISTANT_ID);
    const stored = await this.repo.get(userId, conversationId, scopedAssistantId);
    const now = this.clock.now();
    const old =
      stored &&
      stored.userId === userId &&
      stored.conversationId === conversationId &&
      (stored.assistantId ?? DEFAULT_ASSISTANT_ID) === scopedAssistantId &&
      stored.expiresAt > Math.floor(now.getTime() / 1000)
        ? stored
        : null;
    const recentTurns = [
      ...(old?.recentTurns ?? []).slice(-3),
      {
        message: message.slice(0, 4000),
        reply: reply.slice(0, 4000),
        occurredAt: now.toISOString(),
      },
    ];
    // Preserve older summaries during migration; exact recent turns are authoritative for follow-ups.
    const summary = (old?.summary ?? '').trim().slice(0, 2000);
    await this.repo.put({
      userId,
      conversationId,
      assistantId: scopedAssistantId,
      summary,
      recentTurns,
      createdAt: old?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: Math.floor(now.getTime() / 1000) + this.ttlSeconds,
    });
  }
}
