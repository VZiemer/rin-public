import type { OwnedEntity } from '../model/contracts.js';

export interface FinanceEntry extends OwnedEntity {
  id: string;
  assistantId: string;
  kind: 'income' | 'expense';
  amountMinor: number;
  currency: string;
  categoryId: string;
  occurredOn: string;
  timezone: string;
  note: string;
  status: 'active' | 'cancelled' | 'corrected';
  idempotencyKey: string;
  correctsId?: string | undefined;
  origin: 'chat' | 'correction' | 'system';
  recordedAt: string;
}

export interface FinanceCategory extends OwnedEntity {
  id: string;
  assistantId: string;
  name: string;
  normalizedName: string;
}

export interface FinanceBill extends OwnedEntity {
  id: string;
  assistantId: string;
  label: string;
  amountMinor: number;
  currency: string;
  dueOn: string;
  timezone: string;
  status: 'open' | 'paid' | 'cancelled';
  idempotencyKey: string;
}

export interface FinanceBudget extends OwnedEntity {
  id: string;
  assistantId: string;
  categoryId: string;
  period: string;
  limitMinor: number;
  currency: string;
  idempotencyKey: string;
}

export interface BalanceSnapshot extends OwnedEntity {
  id: string;
  assistantId: string;
  amountMinor: number;
  currency: string;
  reportedAt: string;
  timezone: string;
  source: 'user';
}

export interface FinanceTotals {
  period: string;
  currency: string;
  incomeMinor: number;
  expenseMinor: number;
  resultMinor: number;
  entryIds: string[];
}

export function totalsForPeriod(entries: readonly FinanceEntry[], period: string): FinanceTotals[] {
  const groups = new Map<string, FinanceTotals>();
  for (const entry of entries) {
    if (entry.status !== 'active' || !entry.occurredOn.startsWith(period)) continue;
    const current = groups.get(entry.currency) ?? {
      period,
      currency: entry.currency,
      incomeMinor: 0,
      expenseMinor: 0,
      resultMinor: 0,
      entryIds: [],
    };
    if (entry.kind === 'income') current.incomeMinor += entry.amountMinor;
    else current.expenseMinor += entry.amountMinor;
    current.resultMinor = current.incomeMinor - current.expenseMinor;
    current.entryIds.push(entry.id);
    groups.set(entry.currency, current);
  }
  return [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function normalizeCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
