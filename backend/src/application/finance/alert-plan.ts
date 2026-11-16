import { daysBetween, periodOf } from '../../domain/finance/calendar.js';
import type { FinanceBill, FinanceBudget, FinanceEntry } from '../../domain/finance/model.js';
import type { AlertPreferences } from '../../domain/finance/alerts.js';
import type { InitiativeProposal } from '../skills/proactive-engine.js';

const DISCRETE = 'A Rin tem um aviso financeiro para você.';

export function planFinanceAlerts(input: {
  userId: string;
  assistantId: string;
  bills: readonly FinanceBill[];
  budgets: readonly FinanceBudget[];
  entries: readonly FinanceEntry[];
  preferences: AlertPreferences;
  now: Date;
  localDate: string;
  alreadySentKeys: readonly string[];
}): InitiativeProposal[] {
  if (!input.preferences.enabled) return [];
  if (input.preferences.pausedUntil && Date.parse(input.preferences.pausedUntil) > input.now.getTime()) return [];
  const sent = new Set(input.alreadySentKeys);
  const proposals: InitiativeProposal[] = [];
  for (const bill of input.bills) {
    if (bill.status !== 'open') continue;
    const lead = daysBetween(input.localDate, bill.dueOn);
    if (lead < 0 || lead > input.preferences.leadDays) continue;
    const cooldownKey = `bill:${bill.id}:due:${bill.dueOn}`;
    if (sent.has(cooldownKey)) continue;
    proposals.push(
      proposal(input, cooldownKey, 'due_bill', 0.8, {
        billId: bill.id,
        dueOn: bill.dueOn,
        amountMinor: bill.amountMinor,
        currency: bill.currency,
      }),
    );
  }
  const period = periodOf(input.localDate);
  for (const budget of input.budgets.filter((item) => item.period === period)) {
    const spent = spentOf(input.entries, budget);
    const cooldownKey = `budget:${budget.categoryId}:${budget.period}:${budget.currency}:over`;
    if (spent > budget.limitMinor && !sent.has(cooldownKey)) {
      proposals.push(
        proposal(input, cooldownKey, 'budget_exceeded', 0.9, {
          categoryId: budget.categoryId,
          spentMinor: spent,
          limitMinor: budget.limitMinor,
          currency: budget.currency,
          observed: true,
        }),
      );
    }
    const projectionKey = `budget:${budget.categoryId}:${budget.period}:${budget.currency}:projection`;
    const days = distinctDays(input.entries, budget);
    if (days >= 3 && spent <= budget.limitMinor && !sent.has(projectionKey)) {
      proposals.push(
        proposal(input, projectionKey, 'budget_projection', 0.4, {
          categoryId: budget.categoryId,
          currency: budget.currency,
          observed: false,
          incomplete: true,
        }),
      );
    }
  }
  return proposals;
}

export function lockScreenText(preferences: AlertPreferences): string {
  if (preferences.discretePush) return DISCRETE;
  return 'A Rin quer falar de um lançamento com você.';
}

function proposal(
  input: { userId: string; assistantId: string; now: Date; preferences: AlertPreferences },
  cooldownKey: string,
  reasonCode: string,
  relevance: number,
  factualContext: Record<string, string | number | boolean>,
): InitiativeProposal {
  return {
    id: cooldownKey.replace(/[^a-z0-9:-]/gi, ''),
    userId: input.userId,
    assistantId: input.assistantId,
    skillId: 'finance',
    cooldownKey,
    relevance,
    reasonCode,
    factualContext,
    text: lockScreenText(input.preferences),
    notBefore: input.now.toISOString(),
    priority: 'NORMAL',
  };
}

function spentOf(entries: readonly FinanceEntry[], budget: FinanceBudget): number {
  return entries
    .filter(
      (entry) =>
        entry.status === 'active' &&
        entry.kind === 'expense' &&
        entry.categoryId === budget.categoryId &&
        entry.currency === budget.currency &&
        entry.occurredOn.startsWith(budget.period),
    )
    .reduce((total, entry) => total + entry.amountMinor, 0);
}

function distinctDays(entries: readonly FinanceEntry[], budget: FinanceBudget): number {
  return new Set(
    entries
      .filter(
        (entry) =>
          entry.status === 'active' &&
          entry.categoryId === budget.categoryId &&
          entry.currency === budget.currency &&
          entry.occurredOn.startsWith(budget.period),
      )
      .map((entry) => entry.occurredOn),
  ).size;
}
