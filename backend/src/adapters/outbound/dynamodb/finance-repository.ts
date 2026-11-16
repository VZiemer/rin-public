import { z } from 'zod';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { fromItem } from './mapping.js';
import type { FinanceRepository } from '../../../application/ports/finance.js';
import type {
  BalanceSnapshot,
  FinanceBill,
  FinanceBudget,
  FinanceCategory,
  FinanceEntry,
} from '../../../domain/finance/model.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';

const entrySchema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  kind: z.enum(['income', 'expense']),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string(),
  categoryId: z.string(),
  occurredOn: z.string(),
  timezone: z.string(),
  note: z.string(),
  status: z.enum(['active', 'cancelled', 'corrected']),
  idempotencyKey: z.string(),
  correctsId: z.string().optional(),
  origin: z.enum(['chat', 'correction', 'system']),
  recordedAt: z.string(),
});
const categorySchema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  name: z.string(),
  normalizedName: z.string(),
});
const billSchema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  label: z.string(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string(),
  dueOn: z.string(),
  timezone: z.string(),
  status: z.enum(['open', 'paid', 'cancelled']),
  idempotencyKey: z.string(),
});
const budgetSchema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  categoryId: z.string(),
  period: z.string(),
  limitMinor: z.number().int().nonnegative(),
  currency: z.string(),
  idempotencyKey: z.string(),
});
const balanceSchema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string(),
  reportedAt: z.string(),
  timezone: z.string(),
  source: z.literal('user'),
});

export class DynamoDbFinanceRepository implements FinanceRepository {
  private readonly entries: DynamoStore<FinanceEntry>;
  private readonly categories: DynamoStore<FinanceCategory>;
  private readonly bills: DynamoStore<FinanceBill>;
  private readonly budgets: DynamoStore<FinanceBudget>;
  private readonly balances: DynamoStore<BalanceSnapshot>;

  constructor(
    private client: DocumentClient,
    private table: string,
  ) {
    this.entries = new DynamoStore(client, table, 'FINANCE_ENTRY', entrySchema);
    this.categories = new DynamoStore(client, table, 'FINANCE_CATEGORY', categorySchema);
    this.bills = new DynamoStore(client, table, 'FINANCE_BILL', billSchema);
    this.budgets = new DynamoStore(client, table, 'FINANCE_BUDGET', budgetSchema);
    this.balances = new DynamoStore(client, table, 'FINANCE_BALANCE', balanceSchema);
  }

  async getEntry(userId: string, assistantId: string, id: string) {
    return ownedBy(await this.entries.get(userId, id), assistantId);
  }

  async findEntryByKey(userId: string, assistantId: string, idempotencyKey: string) {
    const direct = await this.getEntry(userId, assistantId, idempotencyKey);
    if (idempotencyKey.startsWith('import-')) return direct;
    if (direct) return direct;
    const entries = await this.listEntries(userId, assistantId);
    return entries.find((entry) => entry.idempotencyKey === idempotencyKey) ?? null;
  }

  async findCorrection(userId: string, assistantId: string, correctsId: string) {
    const entries = await this.listEntries(userId, assistantId);
    return (
      entries.find((entry) => entry.correctsId === correctsId && entry.status === 'active') ?? null
    );
  }

  async insertEntry(entry: FinanceEntry) {
    const current = await this.findEntryByKey(
      entry.userId,
      entry.assistantId,
      entry.idempotencyKey,
    );
    if (current) return { entry: current, created: false };
    if (!(await this.entries.put(entry, entry.id, 'insert-missing'))) {
      const existing = await this.getEntry(entry.userId, entry.assistantId, entry.id);
      if (!existing) throw new Error('Finance entry identity conflict');
      return { entry: existing, created: false };
    }
    return { entry, created: true };
  }

  saveEntry(entry: FinanceEntry) {
    return this.entries.put(entry, entry.id).then(() => undefined);
  }

  async listEntries(userId: string, assistantId: string) {
    return (await this.listAll(userId, 'FINANCE_ENTRY', entrySchema)).filter(
      (entry) => entry.assistantId === assistantId,
    );
  }

  async insertCategory(category: FinanceCategory) {
    const categories = await this.listCategories(category.userId, category.assistantId);
    const current = categories.find((item) => item.normalizedName === category.normalizedName);
    if (current) return { category: current, created: false };
    await this.categories.put(category, category.id);
    return { category, created: true };
  }

  listCategories(userId: string, assistantId: string) {
    return this.categories
      .list(userId, 50)
      .then((items) => items.filter((item) => item.assistantId === assistantId));
  }

  async insertBill(bill: FinanceBill) {
    const bills = await this.listBills(bill.userId, bill.assistantId);
    const current = bills.find((item) => item.idempotencyKey === bill.idempotencyKey);
    if (current) return { bill: current, created: false };
    await this.bills.put(bill, bill.id);
    return { bill, created: true };
  }

  listBills(userId: string, assistantId: string) {
    return this.listAll(userId, 'FINANCE_BILL', billSchema).then((items) =>
      items.filter((item) => item.assistantId === assistantId),
    );
  }

  async saveBudget(budget: FinanceBudget) {
    const budgets = await this.listBudgets(budget.userId, budget.assistantId);
    const current = budgets.find(
      (item) =>
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
    await this.budgets.put(saved, saved.id);
    return saved;
  }
  saveBill(bill: FinanceBill) {
    return this.bills.put(bill, bill.id).then(() => undefined);
  }

  listBudgets(userId: string, assistantId: string) {
    return this.listAll(userId, 'FINANCE_BUDGET', budgetSchema).then((items) =>
      items.filter((item) => item.assistantId === assistantId),
    );
  }

  saveBalance(snapshot: BalanceSnapshot) {
    return this.balances.put(snapshot, snapshot.id).then(() => undefined);
  }

  async latestBalance(userId: string, assistantId: string, currency: string) {
    const snapshots = (await this.listAll(userId, 'FINANCE_BALANCE', balanceSchema)).filter(
      (snapshot) => snapshot.assistantId === assistantId && snapshot.currency === currency,
    );
    return snapshots.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))[0] ?? null;
  }
  private async listAll<T>(userId: string, prefix: string, schema: z.ZodType<T>): Promise<T[]> {
    if (!userId || userId.includes('#')) throw new Error('Invalid finance owner');
    const items: T[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': `${prefix}#` },
          ConsistentRead: true,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      items.push(...(page.Items ?? []).map((item) => schema.parse(fromItem(item))));
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return items;
  }
}

function ownedBy<T extends { assistantId: string }>(
  value: T | null,
  assistantId: string,
): T | null {
  if (!value || value.assistantId !== assistantId) return null;
  return value;
}
