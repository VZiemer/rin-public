import { expect, test } from 'vitest';
import { ShoppingItems } from '../src/application/use-cases/shopping-items.js';
import type { ShoppingItem } from '../src/domain/model/contracts.js';
test('shopping list adds, deduplicates, removes and clears items', async () => {
  const items: ShoppingItem[] = [];
  let n = 0;
  const shopping = new ShoppingItems(
    {
      get: async (_u, id) => items.find((item) => item.id === id) ?? null,
      list: async () => items,
      create: async (item) => {
        items.push(item);
      },
      delete: async (_u, id) => {
        const index = items.findIndex((item) => item.id === id);
        if (index >= 0) items.splice(index, 1);
      },
    },
    { now: () => new Date('2026-09-14T12:00:00.000Z') },
    { next: () => `s-${++n}` },
  );
  const added = await shopping.add('u', ['Leite', 'leite', 'Arroz']);
  expect(added.added.map((item) => item.name)).toEqual(['Leite', 'Arroz']);
  expect(added.alreadyExists).toHaveLength(1);
  const removed = await shopping.remove('u', ['LEITE']);
  expect(removed.removed).toHaveLength(1);
  expect(removed.items.map((item) => item.normalizedName)).toEqual(['arroz']);
  expect((await shopping.clear('u')).items).toEqual([]);
  expect(items).toEqual([]);
});
