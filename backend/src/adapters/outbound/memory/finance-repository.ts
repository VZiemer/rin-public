import type { FinanceRepository } from '../../../application/ports/finance.js';
import type {
  BalanceSnapshot,
  FinanceBill,
  FinanceBudget,
  FinanceCategory,
  FinanceEntry,
} from '../../../domain/finance/model.js';

export class InMemoryFinanceRepository implements FinanceRepository {
  private readonly entries = new Map<string, FinanceEntry>();
  private readonly categories = new Map<string, FinanceCategory>();
  private readonly bills = new Map<string, FinanceBill>();
  private readonly budgets = new Map<string, FinanceBudget>();
  private readonly balances: BalanceSnapshot[] = [];

  async getEntry(userId: string, assistantId: string, id: string) {
    const entry = this.entries.get(this.key(userId, id));
    if (!entry || entry.assistantId !== assistantId) return null;
    return entry;
  }

  async findEntryByKey(userId: string, assistantId: string, idempotencyKey: string) {
    return (
      [...this.entries.values()].find(
        (entry) =>
          entry.userId === userId &&
          entry.assistantId === assistantId &&
          entry.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async findCorrection(userId: string, assistantId: string, correctsId: string) {
    return (
      [...this.entries.values()].find(
        (entry) =>
          entry.userId === userId &&
          entry.assistantId === assistantId &&
          entry.correctsId === correctsId &&
          entry.status === 'active',
      ) ?? null
    );
  }

  async insertEntry(entry: FinanceEntry) {
    const current = await this.findEntryByKey(
      entry.userId,
      entry.assistantId,
      entry.idempotencyKey,
    );
    if (current) return { entry: current, created: false };
    this.entries.set(this.key(entry.userId, entry.id), entry);
    return { entry, created: true };
  }

  async saveEntry(entry: FinanceEntry) {
    this.entries.set(this.key(entry.userId, entry.id), entry);
  }

  async listEntries(userId: string, assistantId: string) {
    return [...this.entries.values()].filter(
      (entry) => entry.userId === userId && entry.assistantId === assistantId,
    );
  }

  async insertCategory(category: FinanceCategory) {
    const current = [...this.categories.values()].find(
      (item) =>
        item.userId === category.userId &&
        item.assistantId === category.assistantId &&
        item.normalizedName === category.normalizedName,
    );
    if (current) return { category: current, created: false };
    this.categories.set(this.key(category.userId, category.id), category);
    return { category, created: true };
  }

  async listCategories(userId: string, assistantId: string) {
    return [...this.categories.values()].filter(
      (category) => category.userId === userId && category.assistantId === assistantId,
    );
  }

  async insertBill(bill: FinanceBill) {
    const current = [...this.bills.values()].find(
      (item) =>
        item.userId === bill.userId &&
        item.assistantId === bill.assistantId &&
        item.idempotencyKey === bill.idempotencyKey,
    );
    if (current) return { bill: current, created: false };
    this.bills.set(this.key(bill.userId, bill.id), bill);
    return { bill, created: true };
  }

  async listBills(userId: string, assistantId: string) {
    return [...this.bills.values()].filter(
      (bill) => bill.userId === userId && bill.assistantId === assistantId,
    );
  }

  async saveBudget(budget: FinanceBudget) {
    const current = [...this.budgets.values()].find(
      (item) =>
        item.userId === budget.userId &&
        item.assistantId === budget.assistantId &&
        item.categoryId === budget.categoryId &&
        item.period === budget.period &&
        item.currency === budget.currency,
    );
    const saved = current
      ? {
          ...current,
          limitMinor: budget.limitMinor,
          updatedAt: budget.updatedAt,
          idempotencyKey: budget.idempotencyKey,
        }
      : budget;
    this.budgets.set(this.key(saved.userId, saved.id), saved);
    return saved;
  }
  async saveBill(bill: FinanceBill) {
    this.bills.set(this.key(bill.userId, bill.id), bill);
  }

  async listBudgets(userId: string, assistantId: string) {
    return [...this.budgets.values()].filter(
      (budget) => budget.userId === userId && budget.assistantId === assistantId,
    );
  }

  async saveBalance(snapshot: BalanceSnapshot) {
    this.balances.push(snapshot);
  }

  async latestBalance(userId: string, assistantId: string, currency: string) {
    return (
      [...this.balances]
        .reverse()
        .find(
          (snapshot) =>
            snapshot.userId === userId &&
            snapshot.assistantId === assistantId &&
            snapshot.currency === currency,
        ) ?? null
    );
  }

  private key(userId: string, id: string) {
    return `${userId}#${id}`;
  }
}
