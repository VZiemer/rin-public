import { z } from 'zod';
import { defineTool } from '../agent/tools.js';
import { requireAssistant } from '../skills/scope.js';
import { debtSchema, planPatchSchema, purchaseSchema } from '../../domain/finance/planning.js';
import type { FinancialPlanning } from './planning.js';
export function financialPlanningTools(planning: FinancialPlanning) {
  return [
    defineTool({
      name: 'list_financial_debts',
      risk: 'READ',
      description:
        'Read the user’s debt balances, agreements, unknown interest and due dates without changing them.',
      inputSchema: z.object({}).strict(),
      execute: (_input, context) => planning.repo.listDebts(context.userId, requireAssistant()),
    }),
    defineTool({
      name: 'report_financial_bill_paid',
      risk: 'WRITE',
      description:
        'Record that the user explicitly says an existing bill was paid. Records its expense once and removes the unpaid reservation; does not perform a bank payment. Ask which bill if ambiguous.',
      inputSchema: z
        .object({ billId: z.string().min(1).max(128), occurredOn: z.iso.date() })
        .strict(),
      execute: (input, context) =>
        planning.reportBillPaid(context.userId, requireAssistant(), input.billId, input.occurredOn),
    }),
    defineTool({
      name: 'review_financial_history',
      risk: 'READ',
      description:
        'Review up to the latest three observed months and spending categories from confirmed ledger entries. Historical averages are not guaranteed income or a complete budget. Do not save estimates automatically.',
      inputSchema: z.object({}).strict(),
      execute: (_input, context) => planning.observed(context.userId, requireAssistant()),
    }),
    defineTool({
      name: 'update_financial_plan',
      risk: 'WRITE',
      description:
        'Save only explicit financial plan inputs, one field at a time if needed. Ask, never invent balances or reserves. Cash excludes credit limits; essential budgets exclude registered bills. Amounts in BRL cents. Do not set reviewed flags unless the user explicitly verified completeness.',
      inputSchema: planPatchSchema,
      execute: (input, context) => planning.update(context.userId, requireAssistant(), input),
    }),
    defineTool({
      name: 'save_financial_debt',
      risk: 'WRITE',
      description:
        'Register or edit a debt/agreement explicitly reported by the user. Unknown interest is null. Payment null means unknown; zero means explicitly no current agreement. No bank action; never infer settlement or renegotiation.',
      inputSchema: debtSchema,
      execute: (input, context) => planning.saveDebt(context.userId, requireAssistant(), input),
    }),
    defineTool({
      name: 'query_financial_plan',
      risk: 'READ',
      description:
        'Calculate safe extra spending until next income, a weekly ceiling, leisure reserve and debt priorities from reviewed data. Never recommend from incomplete data.',
      inputSchema: z.object({}).strict(),
      execute: (_input, context) => planning.summary(context.userId, requireAssistant()),
    }),
    defineTool({
      name: 'assess_financial_purchase',
      risk: 'READ',
      description:
        'Evaluate whether a planned purchase fits reviewed cashflow, including protected leisure. Does not buy, pay or reserve money. Total amount must include financing interest; installments need future projections.',
      inputSchema: purchaseSchema,
      execute: (input, context) => planning.purchase(context.userId, requireAssistant(), input),
    }),
  ];
}
