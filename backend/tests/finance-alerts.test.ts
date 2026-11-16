import { expect, test } from 'vitest';
import { InMemoryAlertPreferenceRepository } from '../src/adapters/outbound/memory/alert-preference-repository.js';
import { planFinanceAlerts } from '../src/application/finance/alert-plan.js';
import { updateAlertPreferences } from '../src/application/finance/alert-chat.js';
import { defaultAlertPreferences } from '../src/domain/finance/alerts.js';
import type { FinanceBill, FinanceBudget, FinanceEntry } from '../src/domain/finance/model.js';
import type { SkillTurn } from '../src/application/skills/runtime.js';

const now = new Date('2026-10-11T15:00:00.000Z');
const preferences = defaultAlertPreferences('user-a', 'RIN', now);

function entry(day: string, amountMinor: number): FinanceEntry {
  return {
    id: day,
    userId: 'user-a',
    assistantId: 'RIN',
    kind: 'expense',
    amountMinor,
    currency: 'BRL',
    categoryId: 'delivery',
    occurredOn: day,
    timezone: 'America/Sao_Paulo',
    note: '',
    status: 'active',
    idempotencyKey: day,
    origin: 'chat',
    recordedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

const bill: FinanceBill = {
  id: 'rent',
  userId: 'user-a',
  assistantId: 'RIN',
  label: 'aluguel',
  amountMinor: 120000,
  currency: 'BRL',
  dueOn: '2026-10-12',
  timezone: 'America/Sao_Paulo',
  status: 'open',
  idempotencyKey: 'rent',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

const budget: FinanceBudget = {
  id: 'cap',
  userId: 'user-a',
  assistantId: 'RIN',
  categoryId: 'delivery',
  period: '2026-10',
  limitMinor: 10000,
  currency: 'BRL',
  idempotencyKey: 'cap',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

test('alerts are discrete, factual, and not repeated for the same threshold', () => {
  const due = planFinanceAlerts({
    userId: 'user-a',
    assistantId: 'RIN',
    bills: [bill],
    budgets: [],
    entries: [],
    preferences,
    now,
    localDate: '2026-10-11',
    alreadySentKeys: [],
  });
  expect(due[0]?.reasonCode).toBe('due_bill');
  expect(due[0]?.text).toBe('A Rin tem um aviso financeiro para você.');
  expect(due[0]?.text).not.toMatch(/R\$|divida|d[ií]vida/i);
  const repeat = planFinanceAlerts({
    userId: 'user-a',
    assistantId: 'RIN',
    bills: [bill],
    budgets: [],
    entries: [],
    preferences,
    now,
    localDate: '2026-10-11',
    alreadySentKeys: [due[0]!.cooldownKey],
  });
  expect(repeat).toEqual([]);

  const over = planFinanceAlerts({
    userId: 'user-a',
    assistantId: 'RIN',
    bills: [],
    budgets: [budget],
    entries: [entry('2026-10-01', 11000)],
    preferences,
    now,
    localDate: '2026-10-11',
    alreadySentKeys: [],
  });
  expect(over.some((item) => item.reasonCode === 'budget_exceeded' && item.factualContext.observed === true)).toBe(true);
  expect(over.some((item) => item.reasonCode === 'budget_projection')).toBe(false);

  const projection = planFinanceAlerts({
    userId: 'user-a',
    assistantId: 'RIN',
    bills: [],
    budgets: [budget],
    entries: [entry('2026-10-01', 100), entry('2026-10-02', 100), entry('2026-10-03', 100)],
    preferences,
    now,
    localDate: '2026-10-11',
    alreadySentKeys: [],
  });
  const forecast = projection.find((item) => item.reasonCode === 'budget_projection');
  expect(forecast?.factualContext.incomplete).toBe(true);
  expect(forecast?.factualContext.observed).toBe(false);
});

test('alert preferences survive a new repository read', async () => {
  const repo = new InMemoryAlertPreferenceRepository();
  const turn = (message: string): SkillTurn => ({
    userId: 'user-a',
    assistantId: 'RIN',
    conversationId: 'c1',
    message,
    now,
    selection: { primary: 'conversation', reason: 'inferred', endedPrevious: false },
    projection: { skillId: 'conversation', records: [], workingSummary: null, omitted: [] },
  });
  await updateAlertPreferences(repo, turn('pausa os alertas financeiros'));
  expect((await repo.get('user-a', 'RIN'))?.enabled).toBe(false);
  await updateAlertPreferences(repo, turn('ativa os alertas'));
  await updateAlertPreferences(repo, turn('no máximo um alerta por dia'));
  const stored = await repo.get('user-a', 'RIN');
  expect(stored).toMatchObject({ enabled: true, maxPerDay: 1, discretePush: true });
});
