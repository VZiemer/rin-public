import type { ShoppingItem } from '../../domain/model/contracts.js';
import type { ShoppingItemRepository } from '../ports/context.js';
import type { Clock, IdGenerator } from '../ports/runtime.js';
export class ShoppingItems {
  constructor(
    private repo: ShoppingItemRepository,
    private clock: Clock,
    private ids: IdGenerator,
  ) {}
  normalize(value: string) {
    return value
      .trim()
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }
  list(userId: string, limit = 100) {
    return this.repo.list(userId, limit);
  }
  async add(userId: string, names: string[]) {
    const requested = [...new Set(names.map((name) => name.trim()).filter(Boolean))].slice(0, 20);
    const existing = await this.repo.list(userId, 200);
    const byName = new Map(existing.map((item) => [item.normalizedName, item]));
    const added: ShoppingItem[] = [];
    const alreadyExists: ShoppingItem[] = [];
    for (const name of requested) {
      const normalizedName = this.normalize(name);
      if (!normalizedName) continue;
      const duplicate = byName.get(normalizedName);
      if (duplicate) {
        alreadyExists.push(duplicate);
        continue;
      }
      const now = this.clock.now().toISOString();
      const item: ShoppingItem = {
        id: this.ids.next(),
        userId,
        name,
        normalizedName,
        createdAt: now,
        updatedAt: now,
      };
      await this.repo.create(item);
      byName.set(normalizedName, item);
      added.push(item);
    }
    return { added, alreadyExists, items: [...byName.values()] };
  }
  async remove(userId: string, names: string[]) {
    const requested = [...new Set(names.map((name) => this.normalize(name)).filter(Boolean))].slice(
      0,
      20,
    );
    const existing = await this.repo.list(userId, 200);
    const removed: ShoppingItem[] = [];
    const notFound: string[] = [];
    for (const normalizedName of requested) {
      const matches = existing.filter((item) => item.normalizedName === normalizedName);
      if (!matches.length) {
        notFound.push(normalizedName);
        continue;
      }
      for (const item of matches) {
        await this.repo.delete(userId, item.id);
        removed.push(item);
      }
    }
    const removedIds = new Set(removed.map((item) => item.id));
    return { removed, notFound, items: existing.filter((item) => !removedIds.has(item.id)) };
  }
  async clear(userId: string) {
    const existing = await this.repo.list(userId, 200);
    for (const item of existing) await this.repo.delete(userId, item.id);
    return { removed: existing, items: [] };
  }
}
