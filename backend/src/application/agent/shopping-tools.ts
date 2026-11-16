import { z } from 'zod';
import { defineTool } from './tools.js';
import { reminderToolSchema, resolveReminderInput } from './task-reminder-tools.js';
import type { ShoppingItems } from '../use-cases/shopping-items.js';
import type { Reminders } from '../use-cases/reminders.js';
export function shoppingTools(shopping: ShoppingItems, reminders: Reminders) {
  const itemsSchema = z
    .object({
      items: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
    })
    .strict();
  const shoppingWithReminderSchema = z
    .object({
      items: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
      reminder: reminderToolSchema.omit({ title: true, relatedTaskId: true, relatedPersonId: true }),
    })
    .strict();
  return [
    defineTool({
      name: 'add_shopping_items',
      description:
        'Add one or more things to the persistent shopping list. Use for groceries, household consumables, or other things the user says they need to buy when no specific reminder time/date is requested. Existing items are deduplicated.',
      risk: 'WRITE',
      inputSchema: itemsSchema,
      execute: (v, c) => shopping.add(c.userId, v.items),
    }),
    defineTool({
      name: 'add_shopping_items_with_reminder',
      description:
        "Add one or more things to the shopping list and also create a timed/date reminder for buying them. Use when the user explicitly gives a time/date, such as 'me lembre às 18h de comprar leite'.",
      risk: 'WRITE',
      inputSchema: shoppingWithReminderSchema,
      execute: async (v, c) => {
        const listResult = await shopping.add(c.userId, v.items);
        const title = v.items.length === 1 ? `Comprar ${v.items[0]}` : 'Passar no mercado';
        const reminder = await reminders.create(
          c.userId,
          resolveReminderInput({ ...v.reminder, title }, c.time),
        );
        return { shopping: listResult, reminder };
      },
    }),
    defineTool({
      name: 'list_shopping_items',
      description:
        'List the current shopping list. Every returned item is still pending because purchased items are deleted rather than kept as completed history.',
      risk: 'READ',
      inputSchema: z.object({}).strict(),
      execute: async (_v, c) => ({ items: await shopping.list(c.userId, 100) }),
    }),
    defineTool({
      name: 'remove_shopping_items',
      description:
        "Remove purchased shopping-list items. Use for phrases like 'já comprei leite', 'comprei leite e arroz', or 'pode tirar sabão da lista'.",
      risk: 'WRITE',
      inputSchema: itemsSchema,
      execute: (v, c) => shopping.remove(c.userId, v.items),
    }),
    defineTool({
      name: 'clear_shopping_list',
      description:
        'Delete every current shopping-list item. Use only when the user clearly says they bought everything, finished the whole shopping list, or explicitly asks to clear it.',
      risk: 'WRITE',
      inputSchema: z.object({}).strict(),
      execute: (_v, c) => shopping.clear(c.userId),
    }),
  ];
}
