import { expect, test, vi } from 'vitest';
import { AppError } from '../src/domain/errors/app-error.js';
import { createHash } from 'node:crypto';
import { S3StatementStorage } from '../src/adapters/outbound/finance/statement-storage.js';
import {
  calculatePlan,
  assessPurchase,
  purchaseSchema,
  type PlanFields,
  type Debt,
} from '../src/domain/finance/planning.js';
import { FinancialPlanning } from '../src/application/finance/planning.js';
import { Statements, ProcessStatement } from '../src/application/finance/statements.js';
import { InMemoryFinancialPlanningRepository } from '../src/adapters/outbound/memory/financial-planning-repository.js';
import { InMemoryFinanceRepository } from '../src/adapters/outbound/memory/finance-repository.js';
import { FinanceLedger } from '../src/application/finance/ledger.js';
import { DynamoDbFinancialPlanningRepository } from '../src/adapters/outbound/dynamodb/financial-planning-repository.js';
import { DynamoDbFinanceRepository } from '../src/adapters/outbound/dynamodb/finance-repository.js';
import { createHandler } from '../src/adapters/inbound/http/handler.js';
import { handleFinanceChat } from '../src/application/finance/chat.js';
import { presentSkill } from '../src/application/skills/present.js';
import { financialPlanningTools } from '../src/application/finance/planning-tools.js';
import { createSkillRegistry } from '../src/application/skills/catalog.js';
import { skillAssistant } from '../src/application/skills/scope.js';
import { selectSkill } from '../src/application/skills/select-intent.js';
import type { ExtractedStatement, StatementRow } from '../src/domain/finance/statement.js';

const now = new Date('2026-10-14T15:00:00Z'),
  clock = { now: () => now };
const values: PlanFields = {
  currency: 'BRL',
  asOfOn: '2026-10-14',
  nextIncomeOn: '2026-11-01',
  cashMinor: 500000,
  monthlyIncomeMinor: 1200000,
  incomeCertain: true,
  essentialsUntilIncomeMinor: 200000,
  monthlyEssentialsMinor: 500000,
  leisureUntilIncomeMinor: 50000,
  monthlyLeisureMinor: 100000,
  bufferMinor: 50000,
  monthlyReserveMinor: 100000,
  debtExtraUntilIncomeMinor: 50000,
  monthlyDebtExtraMinor: 100000,
  billsReviewed: true,
  debtsReviewed: true,
};
const debt: Debt = {
  id: 'loan',
  creditor: 'Credor fictício',
  balanceMinor: 700000,
  monthlyInterestBps: 350,
  monthlyPaymentMinor: 50000,
  nextPaymentOn: '2026-10-25',
  overdue: true,
  essentialRisk: false,
  status: 'active',
};
const bill = {
  id: 'rent',
  userId: 'u',
  assistantId: 'RIN',
  label: 'Conta fictícia',
  amountMinor: 50000,
  currency: 'BRL',
  dueOn: '2026-10-20',
  timezone: 'UTC',
  status: 'open' as const,
  idempotencyKey: 'bill',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
function fixture() {
  const repo = new InMemoryFinancialPlanningRepository(),
    ledgerRepo = new InMemoryFinanceRepository();
  const ledger = new FinanceLedger(ledgerRepo, clock, { next: () => 'balance' });
  const planning = new FinancialPlanning(repo, ledger, clock, 'America/Sao_Paulo');
  const storage = {
    upload: vi.fn(async () => ({ url: 'https://bucket.s3.amazonaws.com/file', headers: {} })),
    read: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  const id = '01900000-0000-7000-8000-000000000001';
  const statements = new Statements(
    repo,
    storage,
    ledger,
    clock,
    { next: () => id },
    'America/Sao_Paulo',
  );
  const row: StatementRow = {
    occurredOn: '2026-10-10',
    description: 'Mercado fictício',
    amountMinor: 4200,
    currency: 'BRL',
    kind: 'expense',
    category: 'mercado',
    externalId: null,
  };
  const preview: ExtractedStatement = {
    complete: true,
    warnings: [],
    rows: [row],
    closingBalanceMinor: 500000,
    balanceOn: '2026-10-14',
  };
  const extractor = { extract: vi.fn(async () => preview) },
    worker = new ProcessStatement(repo, storage, extractor, clock);
  const upload = {
    format: 'csv',
    accountId: 'bank-one',
    sourceKind: 'bank',
    sizeBytes: 3,
    sha256: 'a'.repeat(64),
    consentToAnalysis: true,
  };
  const movement = (key: string, amount = 10000) =>
    ledger.recordEntry({
      userId: 'u',
      assistantId: 'RIN',
      kind: 'expense',
      amountMinor: amount,
      currency: 'BRL',
      categoryId: 'outros',
      occurredOn: '2026-10-14',
      timezone: 'UTC',
      idempotencyKey: key,
    });
  return {
    repo,
    ledgerRepo,
    ledger,
    planning,
    storage,
    statements,
    id,
    row,
    preview,
    extractor,
    worker,
    upload,
    movement,
  };
}
test('available cash reserves essentials, bills, debts, buffer and leisure without counting salary early', () => {
  const plan = calculatePlan(values, [debt], [bill], '2026-10-14');
  expect(plan).toMatchObject({
    status: 'ready',
    freeMinor: 50000,
    leisureMinor: 50000,
    weeklyMinor: 19444,
    monthlyFreeMinor: 300000,
    debtBalanceMinor: 700000,
  });
  expect(
    assessPurchase(plan, purchaseSchema.parse({ amountMinor: 50001, currency: 'BRL' })).decision,
  ).toBe('wait');
  expect(
    assessPurchase(
      plan,
      purchaseSchema.parse({ amountMinor: 90000, currency: 'BRL', purpose: 'leisure' }),
    ).decision,
  ).toBe('fits');
});
test('unknown income, stale balance, incomplete debts and foreign currency fail closed', () => {
  for (const patch of [
    { asOfOn: '2026-10-13' },
    { incomeCertain: false },
    { debtsReviewed: false },
    { billsReviewed: false },
  ])
    expect(calculatePlan({ ...values, ...patch }, [], [], '2026-10-14').status).toBe('needs_input');
  expect(
    calculatePlan(values, [{ ...debt, monthlyPaymentMinor: null }], [], '2026-10-14').status,
  ).toBe('needs_input');
  expect(calculatePlan(values, [], [{ ...bill, currency: 'USD' }], '2026-10-14').status).toBe(
    'needs_input',
  );
});
test('negative cash produces a deficit and cannot become spending permission', () => {
  const plan = calculatePlan({ ...values, cashMinor: -10000 }, [], [], '2026-10-14');
  expect(plan).toMatchObject({ status: 'deficit', freeMinor: 0, leisureMinor: 0 });
  expect(
    assessPurchase(plan, purchaseSchema.parse({ amountMinor: 100, currency: 'BRL' })).decision,
  ).toBe('not_recommended');
});
test('same-day payday obligations are reserved and a linked debt bill is counted once', () => {
  const plan = calculatePlan(
    values,
    [{ ...debt, billId: bill.id, nextPaymentOn: values.nextIncomeOn }],
    [{ ...bill, dueOn: values.nextIncomeOn }],
    '2026-10-14',
  );
  expect(plan).toMatchObject({ billsMinor: 50000, debtPaymentsMinor: 0, freeMinor: 100000 });
});
test('installments require every future month; a later bad month vetoes a good first month', () => {
  const buy = purchaseSchema.parse({
    amountMinor: 60000,
    currency: 'BRL',
    installments: 3,
    firstDueOn: '2026-11-03',
  });
  expect(assessPurchase(calculatePlan(values, [], [], '2026-10-14'), buy).decision).toBe(
    'needs_input',
  );
  const forecast = ['2026-11', '2026-12', '2027-01'].map((period) => ({
    period,
    incomeMinor: 1200000,
    essentialsMinor: 500000,
    billsMinor: 100000,
    debtMinor: 100000,
    leisureMinor: 100000,
    reserveMinor: 100000,
    extraDebtMinor: 100000,
  }));
  expect(
    assessPurchase(calculatePlan({ ...values, forecast }, [], [], '2026-10-14'), buy).decision,
  ).toBe('fits');
  forecast[2]!.billsMinor = 400000;
  expect(
    assessPurchase(calculatePlan({ ...values, forecast }, [], [], '2026-10-14'), buy).decision,
  ).toBe('not_recommended');
});
test('unknown debt interest is visible and never fabricated into a ranking', () => {
  const result = calculatePlan(values, [{ ...debt, monthlyInterestBps: null }], [], '2026-10-14');
  expect(result).toMatchObject({ unknownRateDebtIds: ['loan'], debtOrder: [] });
});
test('new spending consumes the cash margin, including same-millisecond entries, without double counting earlier spending', async () => {
  const f = fixture();
  await f.movement('earlier');
  await f.planning.update('u', 'RIN', values);
  const before = await f.planning.summary('u', 'RIN');
  await f.movement('new');
  const after = await f.planning.summary('u', 'RIN');
  expect(before.status).toBe('ready');
  expect(after).toMatchObject({ freeMinor: 140000 });
  await f.planning.update('u', 'RIN', { cashMinor: 490000 });
  expect(await f.planning.summary('u', 'RIN')).toMatchObject({ freeMinor: 140000 });
});
test('spending inside confirmed essential/leisure buckets consumes the reserved budget rather than reserving it twice', async () => {
  const f = fixture();
  await f.planning.update('u', 'RIN', {
    ...values,
    spendingBuckets: { mercado: 'essential', cinema: 'leisure' },
  });
  const before = await f.planning.summary('u', 'RIN');
  await f.ledger.recordEntry({
    userId: 'u',
    assistantId: 'RIN',
    kind: 'expense',
    amountMinor: 10000,
    currency: 'BRL',
    categoryId: 'mercado',
    occurredOn: '2026-10-14',
    timezone: 'UTC',
    idempotencyKey: 'essential',
  });
  await f.ledger.recordEntry({
    userId: 'u',
    assistantId: 'RIN',
    kind: 'expense',
    amountMinor: 20000,
    currency: 'BRL',
    categoryId: 'cinema',
    occurredOn: '2026-10-14',
    timezone: 'UTC',
    idempotencyKey: 'leisure',
  });
  expect(before).toMatchObject({ freeMinor: 150000 });
  expect(await f.planning.summary('u', 'RIN')).toMatchObject({
    freeMinor: 150000,
    leisureMinor: 30000,
  });
});
test('reporting a paid bill removes its reservation and records cash spending exactly once', async () => {
  const f = fixture();
  await f.ledgerRepo.insertBill(bill);
  await f.planning.saveDebt('u', 'RIN', { ...debt, billId: bill.id, nextPaymentOn: bill.dueOn });
  await f.planning.update('u', 'RIN', values);
  expect(await f.planning.summary('u', 'RIN')).toMatchObject({ freeMinor: 100000 });
  await f.planning.reportBillPaid('u', 'RIN', bill.id, '2026-10-14');
  await f.planning.reportBillPaid('u', 'RIN', bill.id, '2026-10-14');
  expect(await f.ledger.listEntries('u', 'RIN')).toHaveLength(1);
  expect(await f.planning.summary('u', 'RIN')).toMatchObject({
    freeMinor: 100000,
    debtPaymentsMinor: 0,
    billsMinor: 0,
  });
});
test('imports and corrections require a fresh balance rather than inventing cash movements', async () => {
  const f = fixture();
  await f.planning.update('u', 'RIN', values);
  await f.ledger.recordEntry({
    userId: 'u',
    assistantId: 'RIN',
    kind: 'expense',
    amountMinor: 100,
    currency: 'BRL',
    categoryId: 'outros',
    occurredOn: '2026-10-10',
    timezone: 'UTC',
    idempotencyKey: 'historical',
    origin: 'system',
  });
  expect((await f.planning.summary('u', 'RIN')).status).toBe('needs_input');
});
test('plan writes and debt data are isolated by user/assistant, and onboarding asks one thing', async () => {
  const f = fixture();
  await f.planning.update('u', 'RIN', values);
  await f.planning.saveDebt('u', 'RIN', debt);
  expect((await f.planning.summary('other', 'RIN')).status).toBe('needs_input');
  expect((await f.planning.summary('u', 'YUI')).status).toBe('needs_input');
  const chat = await f.planning.chat('other', 'RIN');
  expect(chat.missing).toHaveLength(1);
  expect(chat.tone.allowSarcasm).toBe(false);
  expect(await f.repo.listDebts('other', 'RIN')).toEqual([]);
});
test('document analysis only creates a preview; only explicit reviewed confirmation imports it', async () => {
  const f = fixture();
  await f.statements.create('u', 'RIN', f.upload);
  await f.worker.execute('u', 'RIN', f.id);
  expect(await f.ledger.listEntries('u', 'RIN')).toEqual([]);
  await expect(
    f.statements.commit('u', 'RIN', f.id, { revision: 2, rows: [f.row] }),
  ).rejects.toThrow();
  await expect(f.statements.get('other', 'RIN', f.id)).rejects.toThrow('statement_not_found');
  const command = { revision: 2, confirmed: true, duplicateReviewConfirmed: true, rows: [f.row] };
  await f.statements.commit('u', 'RIN', f.id, command);
  await f.statements.commit('u', 'RIN', f.id, command);
  expect(await f.ledger.listEntries('u', 'RIN')).toHaveLength(1);
});
test('transfers and card settlements do not become income or a second expense', async () => {
  const f = fixture();
  f.preview.rows = [f.row, { ...f.row, kind: 'transfer' }, { ...f.row, kind: 'card_payment' }];
  await f.statements.create('u', 'RIN', f.upload);
  await f.worker.execute('u', 'RIN', f.id);
  await f.statements.commit('u', 'RIN', f.id, {
    revision: 2,
    confirmed: true,
    duplicateReviewConfirmed: true,
    rows: f.preview.rows,
  });
  expect(await f.ledger.listEntries('u', 'RIN')).toHaveLength(1);
});
test('unknown and incomplete statements cannot be committed and S3 duplicates do not repeat analysis', async () => {
  const f = fixture();
  await f.statements.create('u', 'RIN', f.upload);
  await f.worker.execute('u', 'RIN', f.id);
  await f.worker.execute('u', 'RIN', f.id);
  expect(f.extractor.extract).toHaveBeenCalledTimes(1);
  await expect(
    f.statements.commit('u', 'RIN', f.id, {
      revision: 2,
      confirmed: true,
      duplicateReviewConfirmed: true,
      rows: [{ ...f.row, kind: 'unknown' }],
    }),
  ).rejects.toThrow('unknown_transactions');
  const g = fixture();
  g.preview.complete = false;
  await g.statements.create('u', 'RIN', g.upload);
  expect(await g.worker.execute('u', 'RIN', g.id)).toEqual({ status: 'failed' });
  expect((await g.repo.getStatement('u', 'RIN', g.id))?.status).toBe('failed');
});
test('a partial import resumes idempotently and does not accept changed reviewed rows', async () => {
  const f = fixture();
  await f.statements.create('u', 'RIN', f.upload);
  await f.worker.execute('u', 'RIN', f.id);
  const saved = f.repo.saveStatement.bind(f.repo);
  let fail = true;
  vi.spyOn(f.repo, 'saveStatement').mockImplementation(async (job, revision) => {
    if (job.status === 'committed' && fail) {
      fail = false;
      throw new Error('network');
    }
    return saved(job, revision);
  });
  const cmd = { revision: 2, confirmed: true, duplicateReviewConfirmed: true, rows: [f.row] };
  await expect(f.statements.commit('u', 'RIN', f.id, cmd)).rejects.toThrow('network');
  await expect(f.statements.commit('u', 'RIN', f.id, { ...cmd, rows: [] })).rejects.toThrow(
    'review_conflict',
  );
  await f.statements.commit('u', 'RIN', f.id, cmd);
  expect(await f.ledger.listEntries('u', 'RIN')).toHaveLength(1);
});
test('Dynamo paginates financial entries beyond the old 200-entry limit', async () => {
  const f = fixture();
  const { entry } = await f.movement('a');
  const send = vi
    .fn()
    .mockResolvedValueOnce({
      Items: [entry],
      LastEvaluatedKey: { PK: 'USER#u', SK: 'FINANCE_ENTRY#a' },
    })
    .mockResolvedValueOnce({ Items: [{ ...entry, id: 'b' }] });
  expect(
    await new DynamoDbFinanceRepository({ send } as never, 'table').listEntries('u', 'RIN'),
  ).toHaveLength(2);
  expect(send.mock.calls[1]?.[0].input.ExclusiveStartKey).toBeDefined();
});
test('Dynamo plan writes use CAS and scoped keys; all debt pages are read', async () => {
  const f = fixture();
  const record = await f.planning.update('u', 'RIN', values);
  const send = vi.fn().mockResolvedValue({});
  const repo = new DynamoDbFinancialPlanningRepository({ send } as never, 'table');
  expect(await repo.savePlan(record, null)).toBe(true);
  expect(send.mock.calls[0]?.[0].input).toMatchObject({
    Item: { PK: 'USER#u', SK: 'FINANCIAL_PLANNING#RIN#PLAN' },
    ConditionExpression: 'attribute_not_exists(PK)',
  });
  send
    .mockResolvedValueOnce({ Items: [{ data: debt }], LastEvaluatedKey: { PK: 'USER#u', SK: 'x' } })
    .mockResolvedValueOnce({ Items: [{ data: { ...debt, id: 'b' } }] });
  expect(await repo.listDebts('u', 'RIN')).toHaveLength(2);
});
test('finance HTTP requires authenticated scope, rejects forged userId and exposes no upload URL across users', async () => {
  const f = fixture();
  const handler = createHandler({
    environment: 'dev',
    allowDevUserFallback: true,
    devUserId: 'u',
    ids: { next: () => 'c' },
    financialPlanning: f.planning,
    statements: f.statements,
    agent: { execute: vi.fn() },
  });
  const event = (method: string, path: string, body?: unknown) => ({
    rawPath: path,
    requestContext: { requestId: 'x', http: { method } },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  expect(
    (await handler(event('PATCH', '/assistants/RIN/finance/plan', { ...values, userId: 'other' })))
      .statusCode,
  ).toBe(401);
  expect((await handler(event('PATCH', '/assistants/RIN/finance/plan', values))).statusCode).toBe(
    200,
  );
  const noAuth = createHandler({
    environment: 'production',
    ids: { next: () => 'c' },
    financialPlanning: f.planning,
    agent: { execute: vi.fn() },
  });
  expect((await noAuth(event('GET', '/assistants/RIN/finance/plan'))).statusCode).toBe(401);
});
test('chat purchase checks do not record purchases, and the finance skill can reach the new tools', async () => {
  const f = fixture();
  await f.planning.update('u', 'RIN', values);
  const result = await handleFinanceChat(
    {
      planning: f.planning,
      ledger: f.ledger,
      clock,
      timezone: 'UTC',
      ids: { next: () => 'x' },
      pending: {} as never,
    },
    {
      userId: 'u',
      assistantId: 'RIN',
      conversationId: 'c',
      message: 'posso comprar um jogo de 100 reais?',
      now,
      selection: { primary: 'finance', reason: 'explicit', endedPrevious: false },
      projection: { skillId: 'finance', records: [], workingSummary: null, omitted: [] },
    },
  );
  expect(presentSkill(result!).message).toContain('Cabe nos dados');
  expect(await f.ledger.listEntries('u', 'RIN')).toEqual([]);
  const registry = createSkillRegistry();
  for (const tool of financialPlanningTools(f.planning))
    expect(registry.get('finance').allowedTools).toContain(tool.name);
  const tool = financialPlanningTools(f.planning).find((t) => t.name === 'query_financial_plan')!;
  await expect(
    skillAssistant.run('RIN', () => tool.execute({}, { userId: 'u', conversationId: 'c' })),
  ).resolves.toMatchObject({ status: 'ready' });
  expect(
    selectSkill({
      userId: 'u',
      assistantId: 'RIN',
      conversationId: 'c',
      message: 'posso comprar um celular?',
      now,
      active: null,
      anchors: [],
    }).primary,
  ).toBe('finance');
});

test('credit received in chat is not recorded as income', async () => {
  const f = fixture();
  const result = await handleFinanceChat(
    {
      planning: f.planning,
      ledger: f.ledger,
      clock,
      timezone: 'UTC',
      ids: { next: () => 'x' },
      pending: {} as never,
    },
    {
      userId: 'u',
      assistantId: 'RIN',
      conversationId: 'c',
      message: 'recebi 1000 reais de empréstimo',
      now,
      selection: { primary: 'finance', reason: 'explicit', endedPrevious: false },
      projection: { skillId: 'finance', records: [], workingSummary: null, omitted: [] },
    },
  );
  expect(result?.facts[0]?.statement).toContain('dívida');
  expect(await f.ledger.listEntries('u', 'RIN')).toEqual([]);
});

test('plans reject stale paid agreement dates and unsafe totals instead of approving spending', () => {
  expect(
    calculatePlan(
      values,
      [{ ...debt, billId: bill.id, nextPaymentOn: '2026-09-20' }],
      [{ ...bill, dueOn: '2026-09-20', status: 'paid' }],
      '2026-10-14',
    ).status,
  ).toBe('needs_input');
  const manyDebts = Array.from({ length: 10000 }, (_, i) => ({
    ...debt,
    id: String(i),
    balanceMinor: 1_000_000_000_000,
  }));
  expect(calculatePlan(values, manyDebts, [], '2026-10-14').status).toBe('needs_input');
});

test('S3 reads only the owned bounded document and rejects mismatched length, checksum and format', async () => {
  const f = fixture(),
    bytes = Buffer.from('%PDF- synthetic statement');
  await f.statements.create('u', 'RIN', {
    ...f.upload,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const job = { ...(await f.repo.getStatement('u', 'RIN', f.id))!, format: 'pdf' as const };
  const send = vi
    .fn()
    .mockResolvedValueOnce({ ContentLength: bytes.length, ETag: 'version' })
    .mockResolvedValueOnce({ Body: { transformToByteArray: async () => bytes } });
  const storage = new S3StatementStorage({ send } as never, 'private-finance');
  expect(await storage.read(job)).toEqual(bytes);
  expect(send.mock.calls[1]?.[0].input).toMatchObject({
    Bucket: 'private-finance',
    Key: `statements/u/RIN/${f.id}/${job.sha256}.pdf`,
    IfMatch: 'version',
    Range: `bytes=0-${bytes.length - 1}`,
  });
  send.mockResolvedValueOnce({ ContentLength: bytes.length + 1 });
  await expect(storage.read(job)).rejects.toThrow('file_mismatch');
  expect(send).toHaveBeenCalledTimes(3);
  send.mockResolvedValueOnce({ ContentLength: bytes.length }).mockResolvedValueOnce({
    Body: { transformToByteArray: async () => Buffer.alloc(bytes.length) },
  });
  await expect(storage.read(job)).rejects.toThrow('file_mismatch');
  const invalid = Buffer.alloc(bytes.length);
  send
    .mockResolvedValueOnce({ ContentLength: bytes.length })
    .mockResolvedValueOnce({ Body: { transformToByteArray: async () => invalid } });
  await expect(
    storage.read({ ...job, sha256: createHash('sha256').update(invalid).digest('hex') }),
  ).rejects.toThrow('file_mismatch');
});

test('provider failures cannot leak private document text in worker errors', async () => {
  const f = fixture();
  await f.statements.create('u', 'RIN', f.upload);
  f.extractor.extract.mockRejectedValueOnce(new Error('PRIVATE DOCUMENT CONTENT'));
  const error: unknown = await f.worker
    .execute('u', 'RIN', f.id)
    .catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(Error);
  expect(error).toHaveProperty('message', 'Statement analysis failed');
  expect(error).not.toHaveProperty('cause');
  expect(String(error)).not.toContain('PRIVATE DOCUMENT CONTENT');
  expect((await f.repo.getStatement('u', 'RIN', f.id))?.errorCode).toBe(
    'statement_analysis_failed',
  );
});

test.each(['pdf', 'xlsx'])(
  'new %s uploads are rejected before storing a job or signing a URL',
  async (format) => {
    const f = fixture();
    await expect(f.statements.create('u', 'RIN', { ...f.upload, format })).rejects.toThrow();
    expect(await f.repo.getStatement('u', 'RIN', f.id)).toBeNull();
    expect(f.storage.upload).not.toHaveBeenCalled();
  },
);

test('invalid CSV saves a specific failure without asynchronous retries, and recovery clears the old error', async () => {
  const f = fixture();
  await f.statements.create('u', 'RIN', f.upload);
  f.extractor.extract.mockRejectedValueOnce(new AppError('statement_csv_invalid_date', 422));
  expect(await f.worker.execute('u', 'RIN', f.id)).toEqual({ status: 'failed' });
  expect((await f.repo.getStatement('u', 'RIN', f.id))?.errorCode).toBe(
    'statement_csv_invalid_date',
  );
  expect(await f.worker.execute('u', 'RIN', f.id)).toEqual({ status: 'review' });
  expect((await f.repo.getStatement('u', 'RIN', f.id))?.errorCode).toBeUndefined();
  expect(await f.ledger.listEntries('u', 'RIN')).toEqual([]);
});

test('legacy PDF events fail without reading or analyzing the disabled format', async () => {
  const f = fixture();
  await f.statements.create('u', 'RIN', f.upload);
  const job = (await f.repo.getStatement('u', 'RIN', f.id))!;
  await f.repo.saveStatement({ ...job, format: 'pdf', revision: 1 }, 0);
  expect(await f.worker.execute('u', 'RIN', f.id)).toEqual({ status: 'failed' });
  expect((await f.repo.getStatement('u', 'RIN', f.id))?.errorCode).toBe(
    'statement_format_disabled',
  );
  expect(f.storage.read).not.toHaveBeenCalled();
  expect(f.extractor.extract).not.toHaveBeenCalled();
});
