import { isInPeriod } from '../../domain/finance/calendar.js';
import { totalsForPeriod, type FinanceBudget, type FinanceEntry } from '../../domain/finance/model.js';
import type { SkillResult } from '../../domain/skills/definition.js';
import type { FinanceLedger } from './ledger.js';

export async function explainFinances(
  ledger: FinanceLedger,
  input: { userId: string; assistantId: string; period: string; askingBalance?: boolean | undefined },
): Promise<SkillResult> {
  const entries = (await ledger.listEntries(input.userId, input.assistantId)).filter(
    (entry) => entry.status === 'active' && isInPeriod(entry.occurredOn, input.period),
  );
  const totals = totalsForPeriod(entries, input.period);
  const budgets = (await ledger.listBudgets(input.userId, input.assistantId)).filter(
    (budget) => budget.period === input.period,
  );
  if (totals.length === 0 && budgets.length === 0) {
    return {
      skillId: 'finance',
      facts: [{ id: 'empty', statement: `There are no active entries in ${input.period}.` }],
      calculated: [],
      explanations: ['I will not invent expenses, income or bank balances.'],
      missing: input.askingBalance ? ['reported balance'] : [],
      proposedActions: [],
      tone: { intensity: 'measured', allowSarcasm: true },
    };
  }
  const calculated: SkillResult['calculated'][number][] = [];
  const explanations = [
    'Totals are the sum of active entries. Different currencies are not added together.',
  ];
  for (const row of totals) {
    calculated.push(
      { id: `income-${row.currency}`, label: `Income in ${row.currency}`, amountMinor: row.incomeMinor, currency: row.currency },
      { id: `expense-${row.currency}`, label: `Expenses in ${row.currency}`, amountMinor: row.expenseMinor, currency: row.currency },
      { id: `result-${row.currency}`, label: `Period result in ${row.currency}`, amountMinor: row.resultMinor, currency: row.currency },
    );
    explanations.push(
      `Result in ${row.currency} = income minus expenses from entries ${row.entryIds.join(', ')}.`,
    );
    const snapshot = await ledger.latestBalance(input.userId, input.assistantId, row.currency);
    if (snapshot) {
      calculated.push({
        id: `balance-${row.currency}`,
        label: `Reported balance in ${row.currency}`,
        amountMinor: snapshot.amountMinor,
        currency: row.currency,
      });
      explanations.push(`Balance reported by you on ${snapshot.reportedAt}. I did not contact a bank.`);
    } else if (input.askingBalance) {
      explanations.push(`No balance was reported in ${row.currency}. I will not treat the period result as a bank balance.`);
    }
    for (const budget of budgets.filter((item) => item.currency === row.currency)) {
      const spent = spentInCategory(entries, budget);
      calculated.push({
        id: `budget-${budget.categoryId}-${budget.currency}`,
        label: `Remaining budget for ${budget.categoryId} in ${budget.currency}`,
        amountMinor: budget.limitMinor - spent,
        currency: budget.currency,
      });
    }
  }
  for (const budget of budgets) {
    if (!totals.some((row) => row.currency === budget.currency)) {
      explanations.push(
        `The budget for ${budget.categoryId} is in ${budget.currency} and was not compared with another currency.`,
      );
    }
  }
  return {
    skillId: 'finance',
    facts: [{ id: 'source', statement: 'The amounts below come only from active entries for the period.' }],
    calculated,
    explanations,
    missing: [],
    proposedActions: [],
    tone: { intensity: 'measured', allowSarcasm: true },
  };
}

function spentInCategory(entries: readonly FinanceEntry[], budget: FinanceBudget): number {
  return entries
    .filter(
      (entry) =>
        entry.kind === 'expense' &&
        entry.categoryId === budget.categoryId &&
        entry.currency === budget.currency,
    )
    .reduce((total, entry) => total + entry.amountMinor, 0);
}
