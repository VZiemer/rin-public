import { expect, test } from 'vitest';
import { InMemoryFinanceRepository } from '../src/adapters/outbound/memory/finance-repository.js';
import { FinanceLedger } from '../src/application/finance/ledger.js';
import { localDateInZone } from '../src/domain/finance/calendar.js';
import { parseAmountMinor } from '../src/domain/finance/money.js';

const now = new Date('2026-10-12T02:30:00.000Z');

function ledger() {
  return new FinanceLedger(new InMemoryFinanceRepository(), { now: () => now }, { next: () => 'bal-1' });
}

test('money stays in minor units and local dates follow the timezone', () => {
  expect(parseAmountMinor('0,10') + parseAmountMinor('0,20')).toBe(30);
  expect(parseAmountMinor('1.234,56')).toBe(123456);
  expect(parseAmountMinor('42.50')).toBe(4250);
  expect(localDateInZone(now, 'America/Sao_Paulo')).toBe('2026-10-11');
  expect(localDateInZone(now, 'UTC')).toBe('2026-10-12');
});

test('entries belong to the user, corrections do not duplicate, and currencies stay apart', async () => {
  const books = ledger();
  const first = await books.recordEntry({
    userId: 'user-a',
    assistantId: 'RIN',
    kind: 'expense',
    amountMinor: 4200,
    currency: 'BRL',
    categoryId: 'Mercado',
    occurredOn: '2026-10-11',
    timezone: 'America/Sao_Paulo',
    idempotencyKey: 'exp-1',
  });
  const retry = await books.recordEntry({
    userId: 'user-a',
    assistantId: 'RIN',
    kind: 'expense',
    amountMinor: 4200,
    currency: 'BRL',
    categoryId: 'mercado',
    occurredOn: '2026-10-11',
    timezone: 'America/Sao_Paulo',
    idempotencyKey: 'exp-1',
  });
  expect(retry.created).toBe(false);
  expect(retry.entry.id).toBe(first.entry.id);

  await books.recordEntry({
    userId: 'user-a',
    assistantId: 'RIN',
    kind: 'expense',
    amountMinor: 1000,
    currency: 'USD',
    categoryId: 'delivery',
    occurredOn: '2026-10-11',
    timezone: 'America/Sao_Paulo',
    idempotencyKey: 'exp-usd',
  });
  const corrected = await books.correctEntry('user-a', 'RIN', first.entry.id, 2400, 'exp-1-fix');
  const again = await books.correctEntry('user-a', 'RIN', first.entry.id, 2400, 'exp-1-fix');
  expect(again.id).toBe(corrected.id);
  const totals = await books.totals('user-a', 'RIN', '2026-10');
  expect(totals).toEqual([
    expect.objectContaining({ currency: 'BRL', expenseMinor: 2400, incomeMinor: 0, resultMinor: -2400 }),
    expect.objectContaining({ currency: 'USD', expenseMinor: 1000, resultMinor: -1000 }),
  ]);
  expect(await books.totals('user-b', 'RIN', '2026-10')).toEqual([]);
  expect(await books.totals('user-a', 'YUI', '2026-10')).toEqual([]);

  const budget = await books.setBudget({
    userId: 'user-a',
    assistantId: 'RIN',
    categoryId: 'delivery',
    period: '2026-10',
    limitMinor: 30000,
    currency: 'BRL',
    idempotencyKey: 'budget-1',
  });
  const replaced = await books.setBudget({
    userId: 'user-a',
    assistantId: 'RIN',
    categoryId: 'delivery',
    period: '2026-10',
    limitMinor: 20000,
    currency: 'BRL',
    idempotencyKey: 'budget-2',
  });
  expect(replaced.id).toBe(budget.id);
  expect(replaced.limitMinor).toBe(20000);
  await books.cancelEntry('user-a', 'RIN', corrected.id);
  expect((await books.totals('user-a', 'RIN', '2026-10')).find((row) => row.currency === 'BRL')).toBeUndefined();
});
