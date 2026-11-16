import type { MemoryEntry, WorkingMemory } from '../../domain/model/contracts.js';
export interface WorkingMemoryRepository {
  get(userId: string, conversationId: string, assistantId?: string): Promise<WorkingMemory | null>;
  put(memory: WorkingMemory): Promise<void>;
  lastActivityAt(userId: string, limit?: number): Promise<string | null>;
}
export interface MemoryFilter {
  category?: string;
  since?: string;
  limit?: number;
}
export interface MemoryRepository {
  get(userId: string, id: string): Promise<MemoryEntry | null>;
  list(userId: string, filter?: MemoryFilter): Promise<MemoryEntry[]>;
  put(memory: MemoryEntry): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
}
