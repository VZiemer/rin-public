import { AppError } from '../../domain/errors/app-error.js';
import { assertLocalDate, isInPeriod, periodOf } from '../../domain/finance/calendar.js';
import { assertCurrency, assertMinor } from '../../domain/finance/money.js';
import {
  normalizeCategory,
  totalsForPeriod,
  type BalanceSnapshot,
  type FinanceBill,
  type FinanceBudget,
  type FinanceCategory,
  type FinanceEntry,
  type FinanceTotals,
} from '../../domain/finance/model.js';
import type { FinanceRepository } from '../ports/finance.js';
import type { Clock, IdGenerator } from '../ports/runtime.js';

const DEFAULT_CATEGORIES = ['mercado', 'delivery', 'moradia', 'transporte', 'salario', 'outros'];

export interface NewEntry {
  userId: string;
  assistantId: string;
  kind: FinanceEntry['kind'];
  amountMinor: number;
  currency: string;
  categoryId: string;
  occurredOn: string;
  timezone: string;
  note?: string | undefined;
  idempotencyKey: string;
  origin?: FinanceEntry['origin'] | undefined;
}

export class FinanceLedger {
  constructor(
    private readonly repo: FinanceRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async ensureCategories(userId: string, assistantId: string): Promise<FinanceCategory[]> {
    const existing = await this.repo.listCategories(userId, assistantId);
    for (const name of DEFAULT_CATEGORIES) {
      if (existing.some((category) => category.normalizedName === name)) continue;
      const now = this.clock.now().toISOString();
      const created = await this.repo.insertCategory({
        id: `${assistantId}~${name}`,
        userId,
        assistantId,
        name,
        normalizedName: name,
        createdAt: now,
        updatedAt: now,
      });
      existing.push(created.category);
    }
    return existing;
  }

  async recordEntry(input: NewEntry): Promise<{ entry: FinanceEntry; created: boolean }> {
    const now = this.clock.now().toISOString();
    const entry: FinanceEntry = {
      id: input.idempotencyKey,
      userId: input.userId,
      assistantId: input.assistantId,
      kind: input.kind,
      amountMinor: assertMinor(input.amountMinor),
      currency: assertCurrency(input.currency),
      categoryId: normalizeCategory(input.categoryId),
      occurredOn: assertLocalDate(input.occurredOn),
      timezone: input.timezone,
      note: input.note ?? '',
      status: 'active',
      idempotencyKey: input.idempotencyKey,
      origin: input.origin ?? 'chat',
      recordedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.insertEntry(entry);
  }

  async correctEntry(
    userId: string,
    assistantId: string,
    entryId: string,
    amountMinor: number,
    idempotencyKey: string,
  ): Promise<FinanceEntry> {
    const replay = await this.repo.findEntryByKey(userId, assistantId, idempotencyKey);
    if (replay) return replay;
    const current = await this.repo.getEntry(userId, assistantId, entryId);
    if (!current) throw new AppError('finance_entry_not_found', 404);
    if (current.status === 'corrected') {
      const successor = await this.repo.findCorrection(userId, assistantId, entryId);
      if (!successor) throw new AppError('finance_entry_not_found', 404);
      return this.correctEntry(userId, assistantId, successor.id, amountMinor, idempotencyKey);
    }
    if (current.status !== 'active') throw new AppError('finance_entry_not_found', 404);
    const now = this.clock.now().toISOString();
    await this.repo.saveEntry({ ...current, status: 'corrected', updatedAt: now });
    const created = await this.repo.insertEntry({
      ...current,
      id: idempotencyKey,
      amountMinor: assertMinor(amountMinor),
      currency: current.currency,
      status: 'active',
      idempotencyKey,
      correctsId: current.id,
      origin: 'correction',
      recordedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return created.entry;
  }

  async cancelEntry(userId: string, assistantId: string, entryId: string): Promise<FinanceEntry> {
    const current = await this.repo.getEntry(userId, assistantId, entryId);
    if (!current) throw new AppError('finance_entry_not_found', 404);
    if (current.status === 'cancelled') return current;
    const updated = {
      ...current,
      status: 'cancelled' as const,
      updatedAt: this.clock.now().toISOString(),
    };
    await this.repo.saveEntry(updated);
    return updated;
  }

  async recordBill(input: {
    userId: string;
    assistantId: string;
    label: string;
    amountMinor: number;
    currency: string;
    dueOn: string;
    timezone: string;
    idempotencyKey: string;
  }): Promise<{ bill: FinanceBill; created: boolean }> {
    const now = this.clock.now().toISOString();
    return this.repo.insertBill({
      id: input.idempotencyKey,
      userId: input.userId,
      assistantId: input.assistantId,
      label: input.label.trim(),
      amountMinor: assertMinor(input.amountMinor),
      currency: assertCurrency(input.currency),
      dueOn: assertLocalDate(input.dueOn),
      timezone: input.timezone,
      status: 'open',
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
  }

  async setBudget(input: {
    userId: string;
    assistantId: string;
    categoryId: string;
    period: string;
    limitMinor: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<FinanceBudget> {
    if (!/^\d{4}-\d{2}$/.test(input.period)) throw new AppError('invalid_period', 422);
    const now = this.clock.now().toISOString();
    return this.repo.saveBudget({
      id: input.idempotencyKey,
      userId: input.userId,
      assistantId: input.assistantId,
      categoryId: normalizeCategory(input.categoryId),
      period: input.period,
      limitMinor: assertMinor(input.limitMinor),
      currency: assertCurrency(input.currency),
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
  }

  async reportBalance(input: {
    userId: string;
    assistantId: string;
    amountMinor: number;
    currency: string;
    timezone: string;
  }): Promise<BalanceSnapshot> {
    const now = this.clock.now();
    const snapshot: BalanceSnapshot = {
      id: this.ids.next(),
      userId: input.userId,
      assistantId: input.assistantId,
      amountMinor: assertMinor(input.amountMinor),
      currency: assertCurrency(input.currency),
      reportedAt: now.toISOString(),
      timezone: input.timezone,
      source: 'user',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.repo.saveBalance(snapshot);
    return snapshot;
  }

  listEntries(userId: string, assistantId: string) {
    return this.repo.listEntries(userId, assistantId);
  }

  listBills(userId: string, assistantId: string) {
    return this.repo.listBills(userId, assistantId);
  }

  listBudgets(userId: string, assistantId: string) {
    return this.repo.listBudgets(userId, assistantId);
  }
  async reportBillPaid(userId: string, assistantId: string, id: string, occurredOn: string) {
    const bill = (await this.repo.listBills(userId, assistantId)).find((b) => b.id === id);
    if (!bill || bill.status === 'cancelled') throw new AppError('finance_bill_not_found', 404);
    if (bill.status === 'paid') return bill;
    await this.recordEntry({
      userId,
      assistantId,
      kind: 'expense',
      amountMinor: bill.amountMinor,
      currency: bill.currency,
      categoryId: 'bill_payment',
      occurredOn,
      timezone: bill.timezone,
      note: `Pagamento informado: ${bill.label}`,
      idempotencyKey: `bill-paid-${assistantId}-${id}`,
      origin: 'chat',
    });
    const paid = { ...bill, status: 'paid' as const, updatedAt: this.clock.now().toISOString() };
    await this.repo.saveBill(paid);
    return paid;
  }

  latestBalance(userId: string, assistantId: string, currency: string) {
    return this.repo.latestBalance(userId, assistantId, currency);
  }

  async totals(userId: string, assistantId: string, period: string): Promise<FinanceTotals[]> {
    const entries = await this.repo.listEntries(userId, assistantId);
    return totalsForPeriod(
      entries.filter((entry) => isInPeriod(entry.occurredOn, period)),
      periodOf(`${period}-01`),
    );
  }
}
