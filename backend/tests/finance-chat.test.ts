import { expect, test } from 'vitest';
import { InMemoryFinanceRepository } from '../src/adapters/outbound/memory/finance-repository.js';
import { InMemoryPendingSkillOperationRepository } from '../src/adapters/outbound/memory/pending-skill-operation-repository.js';
import { handleFinanceChat, type FinanceChatDeps } from '../src/application/finance/chat.js';
import { FinanceLedger } from '../src/application/finance/ledger.js';
import { presentSkill } from '../src/application/skills/present.js';
import type { SkillTurn } from '../src/application/skills/runtime.js';

const now = new Date('2026-10-11T15:00:00.000Z');
let sequence = 0;

function deps(): FinanceChatDeps & { ledger: FinanceLedger; pending: InMemoryPendingSkillOperationRepository } {
  return {
    ledger: new FinanceLedger(new InMemoryFinanceRepository(), { now: () => now }, { next: () => 'bal' }),
    pending: new InMemoryPendingSkillOperationRepository(),
    clock: { now: () => now },
    ids: { next: () => `op-${sequence++}` },
    timezone: 'America/Sao_Paulo',
  };
}

function turn(message: string): SkillTurn {
  return {
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
    message,
    now,
    selection: { primary: 'finance', reason: 'explicit', endedPrevious: false },
    projection: { skillId: 'finance', records: [], workingSummary: null, omitted: [] },
  };
}

test('chat records, queries, corrects and limits without inventing money movement', async () => {
  const books = deps();
  const recorded = await handleFinanceChat(books, turn('gastei 42 reais no mercado'));
  expect(presentSkill(recorded!).message).toContain('R$ 42,00');
  const again = await handleFinanceChat(books, turn('gastei 42 reais no mercado'));
  expect(again?.facts[0]?.statement).toMatch(/já estava registrado/);
  expect(await books.ledger.listEntries('user-a', 'RIN')).toHaveLength(1);

  const spent = await handleFinanceChat(books, turn('quanto gastei com delivery este mês?'));
  expect(spent?.facts[0]?.statement).toMatch(/Não há despesas de delivery/);

  const corrected = await handleFinanceChat(books, turn('essa compra foi 24, não 42'));
  expect(presentSkill(corrected!).message).toContain('R$ 24,00');
  const active = (await books.ledger.listEntries('user-a', 'RIN')).filter((entry) => entry.status === 'active');
  expect(active).toHaveLength(1);
  expect(active[0]?.amountMinor).toBe(2400);

  const limit = await handleFinanceChat(books, turn('limita delivery a 300 por mês'));
  expect(presentSkill(limit!).message).toContain('R$ 300,00');
  expect((await books.ledger.listBudgets('user-a', 'RIN'))[0]?.currency).toBe('BRL');

  const refused = await handleFinanceChat(books, turn('quero investir essa grana na bolsa'));
  expect(refused?.explanations.join(' ')).toMatch(/Não faço investimento/);
  expect(await books.ledger.listEntries('user-a', 'RIN')).toHaveLength(2);
});

test('an ambiguous correction waits and does not change either entry', async () => {
  const books = deps();
  await books.ledger.recordEntry({
    userId: 'user-a',
    assistantId: 'RIN',
    kind: 'expense',
    amountMinor: 4200,
    currency: 'BRL',
    categoryId: 'mercado',
    occurredOn: '2026-10-11',
    timezone: 'America/Sao_Paulo',
    idempotencyKey: 'a',
  });
  await books.ledger.recordEntry({
    userId: 'user-a',
    assistantId: 'RIN',
    kind: 'expense',
    amountMinor: 4200,
    currency: 'BRL',
    categoryId: 'delivery',
    occurredOn: '2026-10-11',
    timezone: 'America/Sao_Paulo',
    idempotencyKey: 'b',
  });
  const result = await handleFinanceChat(books, turn('essa compra foi 24, não 42'));
  expect(result?.missing).toContain('qual lançamento');
  const open = await books.pending.listOpen('user-a', 'RIN', 'c1', now);
  expect(open).toHaveLength(2);
  const active = (await books.ledger.listEntries('user-a', 'RIN')).filter((entry) => entry.status === 'active');
  expect(active.every((entry) => entry.amountMinor === 4200)).toBe(true);
});
