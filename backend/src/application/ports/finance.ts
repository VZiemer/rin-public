import type {
  BalanceSnapshot,
  FinanceBill,
  FinanceBudget,
  FinanceCategory,
  FinanceEntry,
} from '../../domain/finance/model.js';

export interface FinanceRepository {
  getEntry(userId: string, assistantId: string, id: string): Promise<FinanceEntry | null>;
  findEntryByKey(
    userId: string,
    assistantId: string,
    idempotencyKey: string,
  ): Promise<FinanceEntry | null>;
  findCorrection(
    userId: string,
    assistantId: string,
    correctsId: string,
  ): Promise<FinanceEntry | null>;
  insertEntry(entry: FinanceEntry): Promise<{ entry: FinanceEntry; created: boolean }>;
  saveEntry(entry: FinanceEntry): Promise<void>;
  listEntries(userId: string, assistantId: string): Promise<FinanceEntry[]>;
  insertCategory(
    category: FinanceCategory,
  ): Promise<{ category: FinanceCategory; created: boolean }>;
  listCategories(userId: string, assistantId: string): Promise<FinanceCategory[]>;
  insertBill(bill: FinanceBill): Promise<{ bill: FinanceBill; created: boolean }>;
  listBills(userId: string, assistantId: string): Promise<FinanceBill[]>;
  saveBill(bill: FinanceBill): Promise<void>;
  saveBudget(budget: FinanceBudget): Promise<FinanceBudget>;
  listBudgets(userId: string, assistantId: string): Promise<FinanceBudget[]>;
  saveBalance(snapshot: BalanceSnapshot): Promise<void>;
  latestBalance(
    userId: string,
    assistantId: string,
    currency: string,
  ): Promise<BalanceSnapshot | null>;
}
