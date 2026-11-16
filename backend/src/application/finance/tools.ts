import { z } from 'zod';
import { defineTool, type AgentTool, type ToolExecutionContext } from '../agent/tools.js';
import { assertCurrency } from '../../domain/finance/money.js';
import type { FinanceLedger } from './ledger.js';
import { explainFinances } from './analysis.js';
import { requireAssistant } from '../skills/scope.js';

const movement = z
  .object({
    kind: z.enum(['income', 'expense']),
    amountMinor: z.number().int().nonnegative().optional(),
    currency: z.string().optional(),
    categoryId: z.string().trim().min(1).max(80),
    occurredOn: z.string(),
    timezone: z.string().min(1),
    note: z.string().max(200).optional(),
    idempotencyKey: z.string().min(1).max(128),
  })
  .strict();

export function financeTools(ledger: FinanceLedger): AgentTool[] {
  return [
    defineTool({
      name: 'record_finance_movement',
      description: 'Record an income or expense when amount and currency are both present.',
      risk: 'WRITE',
      inputSchema: movement,
      execute: (input, context) => recordMovement(ledger, input, context),
    }),
    defineTool({
      name: 'query_finance_summary',
      description: 'Explain period totals, reported balance and remaining budget without mixing currencies.',
      risk: 'READ',
      inputSchema: z.object({ period: z.string(), askingBalance: z.boolean().optional() }).strict(),
      execute: async (input, context) =>
        explainFinances(ledger, {
          userId: context.userId,
          assistantId: requireAssistant(),
          period: input.period,
          askingBalance: input.askingBalance,
        }),
    }),
    defineTool({
      name: 'list_finance_entries',
      description: 'List active finance entries for one period and currency.',
      risk: 'READ',
      inputSchema: z.object({ period: z.string(), currency: z.string().optional() }).strict(),
      execute: async (input, context) => {
        const entries = await ledger.listEntries(context.userId, requireAssistant());
        return entries.filter(
          (entry) =>
            entry.status === 'active' &&
            entry.occurredOn.startsWith(input.period) &&
            (!input.currency || entry.currency === input.currency),
        );
      },
    }),
    defineTool({
      name: 'list_finance_bills',
      description: 'List open bills without treating them as a bank balance.',
      risk: 'READ',
      inputSchema: z.object({}).strict(),
      execute: async (_input, context) =>
        (await ledger.listBills(context.userId, requireAssistant())).filter((bill) => bill.status === 'open'),
    }),
    defineTool({
      name: 'set_finance_budget',
      description: 'Set a category budget for a period and currency.',
      risk: 'WRITE',
      inputSchema: z
        .object({
          categoryId: z.string().min(1),
          period: z.string(),
          limitMinor: z.number().int().nonnegative().optional(),
          currency: z.string().optional(),
          idempotencyKey: z.string().min(1),
        })
        .strict(),
      execute: async (input, context) => {
        const missing = [input.limitMinor === undefined ? 'valor' : '', input.currency ? '' : 'moeda'].filter(Boolean);
        if (missing.length > 0) return { status: 'needs_input' as const, missing };
        const budget = await ledger.setBudget({
          userId: context.userId,
          assistantId: requireAssistant(),
          categoryId: input.categoryId,
          period: input.period,
          limitMinor: input.limitMinor ?? 0,
          currency: assertCurrency(input.currency ?? ''),
          idempotencyKey: input.idempotencyKey,
        });
        return { status: 'saved' as const, budget };
      },
    }),
  ];
}

async function recordMovement(
  ledger: FinanceLedger,
  input: z.infer<typeof movement>,
  context: ToolExecutionContext,
) {
  const missing = [input.amountMinor === undefined ? 'valor' : '', input.currency ? '' : 'moeda'].filter(Boolean);
  if (missing.length > 0) return { status: 'needs_input' as const, missing };
  const before = (await ledger.listEntries(context.userId, requireAssistant())).length;
  const saved = await ledger.recordEntry({
    userId: context.userId,
    assistantId: requireAssistant(),
    kind: input.kind,
    amountMinor: input.amountMinor ?? 0,
    currency: assertCurrency(input.currency ?? ''),
    categoryId: input.categoryId,
    occurredOn: input.occurredOn,
    timezone: input.timezone,
    note: input.note,
    idempotencyKey: input.idempotencyKey,
  });
  const after = (await ledger.listEntries(context.userId, requireAssistant())).length;
  return {
    status: saved.created ? ('created' as const) : ('existing' as const),
    entryId: saved.entry.id,
    amountMinor: saved.entry.amountMinor,
    currency: saved.entry.currency,
    entries: after,
    unchanged: before === after || !saved.created,
  };
}
