import { expect, test } from 'vitest';
import { InMemoryFinanceRepository } from '../src/adapters/outbound/memory/finance-repository.js';
import { explainFinances } from '../src/application/finance/analysis.js';
import { FinanceLedger } from '../src/application/finance/ledger.js';
import { financeTools } from '../src/application/finance/tools.js';
import { presentSkill } from '../src/application/skills/present.js';
import { skillAssistant } from '../src/application/skills/scope.js';

const now = new Date('2026-10-11T15:00:00.000Z');

function books() {
  return new FinanceLedger(new InMemoryFinanceRepository(), { now: () => now }, { next: () => 'id' });
}

test('analysis explains empty periods, currency splits and reported balance', async () => {
  const ledger = books();
  const empty = await explainFinances(ledger, {
    userId: 'user-a',
    assistantId: 'RIN',
    period: '2026-10',
    askingBalance: true,
  });
  expect(empty.calculated).toEqual([]);
  expect(empty.explanations.join(' ')).toMatch(/não vou inventar/i);
  expect(empty.missing).toContain('saldo informado');

  await ledger.recordEntry({
    userId: 'user-a',
    assistantId: 'RIN',
    kind: 'expense',
    amountMinor: 4200,
    currency: 'BRL',
    categoryId: 'delivery',
    occurredOn: '2026-10-02',
    timezone: 'America/Sao_Paulo',
    idempotencyKey: 'e1',
  });
  await ledger.recordEntry({
    userId: 'user-a',
    assistantId: 'RIN',
    kind: 'expense',
    amountMinor: 500,
    currency: 'USD',
    categoryId: 'delivery',
    occurredOn: '2026-10-03',
    timezone: 'America/Sao_Paulo',
    idempotencyKey: 'e2',
  });
  await ledger.setBudget({
    userId: 'user-a',
    assistantId: 'RIN',
    categoryId: 'delivery',
    period: '2026-10',
    limitMinor: 30000,
    currency: 'BRL',
    idempotencyKey: 'b1',
  });
  await ledger.reportBalance({
    userId: 'user-a',
    assistantId: 'RIN',
    amountMinor: 100000,
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
  });
  const result = await explainFinances(ledger, { userId: 'user-a', assistantId: 'RIN', period: '2026-10' });
  const output = presentSkill(result);
  expect(output.message).toContain('R$ 42,00');
  expect(output.message).toContain('5,00 USD');
  expect(output.message).toContain('R$ 258,00');
  expect(output.message).toContain('R$ 1000,00');
  expect(output.message).not.toMatch(/R\$ 47,00|47,00 USD/);
  expect(result.explanations.join(' ')).toMatch(/Não consultei banco/);
  expect(result.calculated.find((value) => value.id === 'balance-USD')).toBeUndefined();
});

test('a movement without currency is not stored', async () => {
  const ledger = books();
  const tool = financeTools(ledger).find((item) => item.name === 'record_finance_movement');
  const result = await skillAssistant.run('RIN', () =>
    tool!.execute(
      {
        kind: 'expense',
        amountMinor: 4200,
        categoryId: 'mercado',
        occurredOn: '2026-10-11',
        timezone: 'America/Sao_Paulo',
        idempotencyKey: 'missing-currency',
      },
      { userId: 'user-a', conversationId: 'c1' },
    ),
  );
  expect(result).toMatchObject({ status: 'needs_input', missing: ['moeda'] });
  expect(await ledger.listEntries('user-a', 'RIN')).toEqual([]);
});
