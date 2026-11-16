import { z } from 'zod';
import type { MemoryRepository, MemoryFilter } from '../ports/memory.js';
import type { Clock, IdGenerator } from '../ports/runtime.js';
import { AppError } from '../../domain/errors/app-error.js';
const inputSchema = z
  .object({
    content: z.string().trim().min(1).max(2000),
    category: z.string().trim().min(1).max(64),
  })
  .strict();
export class Memories {
  constructor(
    private repo: MemoryRepository,
    private clock: Clock,
    private ids: IdGenerator,
  ) {}
  async create(userId: string, input: unknown) {
    const v = inputSchema.parse(input);
    const now = this.clock.now().toISOString();
    const memory = { ...v, userId, id: this.ids.next(), createdAt: now, updatedAt: now };
    await this.repo.put(memory);
    return memory;
  }
  async get(u: string, id: string) {
    const v = await this.repo.get(u, id);
    if (!v) throw new AppError('memory_not_found', 404);
    return v;
  }
  list(u: string, filter?: MemoryFilter) {
    return this.repo.list(u, filter);
  }
  async update(u: string, id: string, input: unknown) {
    const old = await this.get(u, id);
    const value = {
      ...old,
      ...inputSchema.parse(input),
      updatedAt: this.clock.now().toISOString(),
    };
    await this.repo.put(value);
    return value;
  }
  async delete(u: string, id: string) {
    await this.get(u, id);
    await this.repo.delete(u, id);
  }
}
