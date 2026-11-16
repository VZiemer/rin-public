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
      facts: [{ id: 'empty', statement: `Não há lançamentos ativos em ${input.period}.` }],
      calculated: [],
      explanations: ['Não vou inventar gastos, receitas ou saldo bancário.'],
      missing: input.askingBalance ? ['saldo informado'] : [],
      proposedActions: [],
      tone: { intensity: 'measured', allowSarcasm: true },
    };
  }
  const calculated: SkillResult['calculated'][number][] = [];
  const explanations = [
    'Os totais saem da soma dos lançamentos ativos. Moedas diferentes não são somadas.',
  ];
  for (const row of totals) {
    calculated.push(
      { id: `income-${row.currency}`, label: `Receitas em ${row.currency}`, amountMinor: row.incomeMinor, currency: row.currency },
      { id: `expense-${row.currency}`, label: `Despesas em ${row.currency}`, amountMinor: row.expenseMinor, currency: row.currency },
      { id: `result-${row.currency}`, label: `Resultado do período em ${row.currency}`, amountMinor: row.resultMinor, currency: row.currency },
    );
    explanations.push(
      `Resultado em ${row.currency} = receitas menos despesas dos lançamentos ${row.entryIds.join(', ')}.`,
    );
    const snapshot = await ledger.latestBalance(input.userId, input.assistantId, row.currency);
    if (snapshot) {
      calculated.push({
        id: `balance-${row.currency}`,
        label: `Saldo informado em ${row.currency}`,
        amountMinor: snapshot.amountMinor,
        currency: row.currency,
      });
      explanations.push(`Saldo informado por você em ${snapshot.reportedAt}. Não consultei banco.`);
    } else if (input.askingBalance) {
      explanations.push(`Não há saldo informado em ${row.currency}. Não vou tratar o resultado do período como saldo bancário.`);
    }
    for (const budget of budgets.filter((item) => item.currency === row.currency)) {
      const spent = spentInCategory(entries, budget);
      calculated.push({
        id: `budget-${budget.categoryId}-${budget.currency}`,
        label: `Orçamento restante de ${budget.categoryId} em ${budget.currency}`,
        amountMinor: budget.limitMinor - spent,
        currency: budget.currency,
      });
    }
  }
  for (const budget of budgets) {
    if (!totals.some((row) => row.currency === budget.currency)) {
      explanations.push(
        `O orçamento de ${budget.categoryId} está em ${budget.currency} e não foi comparado com outra moeda.`,
      );
    }
  }
  return {
    skillId: 'finance',
    facts: [{ id: 'source', statement: 'Os valores abaixo vêm só dos registros ativos do período.' }],
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
