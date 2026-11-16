import { expect, test } from 'vitest';
import { CsvStatementExtractor } from '../src/adapters/outbound/finance/csv-statement-extractor.js';
import { AppError } from '../src/domain/errors/app-error.js';
import type { StatementJob } from '../src/domain/finance/statement.js';

const job: StatementJob = {
  userId: 'synthetic-user',
  assistantId: 'RIN',
  id: '01900000-0000-7000-8000-000000000001',
  revision: 0,
  status: 'uploaded_pending',
  format: 'csv',
  accountId: 'synthetic-bank',
  sourceKind: 'bank',
  sizeBytes: 42,
  sha256: 'ab'.repeat(32),
  createdAt: '2026-10-16T12:00:00.000Z',
  updatedAt: '2026-10-16T12:00:00.000Z',
};
const extractor = new CsvStatementExtractor();
const parse = (csv: string, overrides: Partial<StatementJob> = {}) =>
  extractor.extract({ ...job, ...overrides }, Buffer.from(csv));
const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
const csvWith = (amount: string, type = 'Saída', date = '16/10/2026', currency = 'BRL') =>
  `Data;Historico;Valor;Tipo;Moeda\n${date};Loja fictícia;${amount};${type};${currency}`;

async function rejectsWith(csv: string, code: string) {
  await expect(parse(csv)).rejects.toMatchObject({ code, status: 422 });
}

test('extracts the original ISO bank smoke CSV with exact positive cents', async () => {
  const result = await parse(
    'Data,Descricao,Valor,Moeda,Tipo\n2026-10-14,Mercado ficticio,-12.34,BRL,Despesa',
  );
  expect(result).toEqual({
    complete: true,
    warnings: [],
    closingBalanceMinor: null,
    balanceOn: null,
    rows: [
      {
        occurredOn: '2026-10-14',
        description: 'Mercado ficticio',
        amountMinor: 1234,
        currency: 'BRL',
        kind: 'expense',
        category: 'sem_categoria',
        externalId: null,
      },
    ],
  });
});

test('extracts the observed BOM bank layout with decimal commas and Entrada/Saída', async () => {
  const result = await parse(
    '\uFEFFdata,hora,tipo,"origem / destino",valor,"forma de pagamento"\r\n' +
      '16/10/2026,12:00,Saída,"Loja, fictícia","-R$ 1.234,56",Pix\r\n' +
      '16/10/2026,13:00,Entrada,Cliente fictício,"R$ 25,00",Pix\r\n',
  );
  expect(result.warnings).toEqual([]);
  expect(result.rows).toMatchObject([
    {
      occurredOn: '2026-10-16',
      description: 'Saída - Loja, fictícia',
      amountMinor: 123456,
      kind: 'expense',
    },
    { amountMinor: 2500, kind: 'income' },
  ]);
  expect(result.rows.every((row) => row.externalId === null)).toBe(true);
});

test('extracts the Nubank signed layout and preserves only genuine identifiers', async () => {
  const result = await parse(
    'Data,Valor,Identificador,Descrição\n16/10/2026,-12.34,synthetic-1,Mercado\n16/10/2026,100.00,synthetic-2,Salário',
  );
  expect(result.rows).toMatchObject([
    { amountMinor: 1234, kind: 'expense', externalId: 'synthetic-1' },
    { amountMinor: 10000, kind: 'income', externalId: 'synthetic-2' },
  ]);
  expect(result.warnings).toEqual([
    'Moeda ausente no CSV: BRL foi assumido; confira a moeda antes de confirmar.',
  ]);
});

test('handles the mathematical minus exported by the real bank layout without losing its direction', async () => {
  const result = await parse(
    'data,hora,tipo,"origem / destino",valor,"forma de pagamento"\n' +
      '16/10/2026,12:00,Saída,Loja fictícia,"−R$ 1.234,56",Pix\n' +
      '16/10/2026,12:01,Saída,Outra loja,"−R$ 12,34",Pix',
  );
  expect(result.rows).toMatchObject([
    { amountMinor: 123456, kind: 'expense' },
    { amountMinor: 1234, kind: 'expense' },
  ]);
  expect(result.warnings).toEqual([]);
});

test('accepts only explicit supported Unicode signs and narrow nonbreaking grouping spaces', async () => {
  expect((await parse(csvWith('－R$ 1\u202f234,56'))).rows[0]?.amountMinor).toBe(123456);
  expect((await parse(csvWith('＋R$ 12,34', 'Entrada'))).rows[0]?.kind).toBe('income');
  await rejectsWith(csvWith('–R$ 12,34'), 'statement_csv_invalid');
});

test.each([';', '\t'])(
  'supports %j separators, quoted delimiters, escaped quotes and multiline descriptions',
  async (separator) => {
    const description = `Compra ${separator} "fictícia"\nsegunda linha`;
    const result = await parse(
      ['data', 'historico', 'valor', 'tipo'].join(separator) +
        '\n' +
        ['16-10-2026', quote(description), '-12,34', 'Saída'].join(separator),
    );
    expect(result.rows[0]).toMatchObject({
      description,
      amountMinor: 1234,
      kind: 'expense',
      occurredOn: '2026-10-16',
    });
  },
);

test('supports the explicit Excel delimiter directive without skipping arbitrary preambles', async () => {
  expect((await parse('sep=;\r\n' + csvWith('-12,34'))).rows[0]?.amountMinor).toBe(1234);
  await rejectsWith(
    'Relatório da conta\n' + csvWith('-12,34'),
    'statement_csv_unsupported_columns',
  );
});

test('decodes UTF-16LE, UTF-16BE and Windows-1252 without corrupting descriptions', async () => {
  const text = csvWith('-12,34');
  const little = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  const big = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()]);
  // All characters in this fixture have the same Windows-1252 and Latin-1 encoding.
  const windows = Buffer.from(text, 'latin1');
  for (const bytes of [little, big, windows]) {
    expect((await extractor.extract(job, bytes)).rows[0]?.description).toBe('Loja fictícia');
  }
  const euro = Buffer.from(
    'Data;Historico;Valor;Tipo\n16/10/2026;Taxa ' + String.fromCharCode(0x80) + ';12,34;Saída',
    'latin1',
  );
  expect((await extractor.extract(job, euro)).rows[0]?.description).toBe('Taxa €');
});

test.each([
  ['-R$ 1.234,56', 123456],
  ['-BRL 1,234.56', 123456],
  ['(12,34)', 1234],
  ['12.34 D', 1234],
  ['12,34-', 1234],
  ['12', 1200],
  ['12,3', 1230],
  ['1.234.567', 123456700],
  ['1,234,567', 123456700],
  ['1 234,56', 123456],
  ['10000000000,00', 1_000_000_000_000],
] as const)('parses exact cents from %s without floating point', async (amount, expected) => {
  expect((await parse(csvWith(amount))).rows[0]?.amountMinor).toBe(expected);
});

test('supports C suffix and signed income while reconciling stated direction', async () => {
  expect((await parse(csvWith('12,34 C', 'Entrada'))).rows[0]).toMatchObject({
    kind: 'income',
    amountMinor: 1234,
  });
  expect((await parse(csvWith('+0,29', 'Entrada'))).rows[0]?.amountMinor).toBe(29);
  const conflict = await parse(csvWith('-12,34', 'Entrada'));
  expect(conflict.rows[0]?.kind).toBe('unknown');
  expect(conflict.warnings.join(' ')).toContain('conflito');
});

test('uses consistent decimal evidence before accepting a single thousands separator', async () => {
  const br = await parse(csvWith('1.234') + '\n16/10/2026;Outra loja;12,34;Saída;BRL');
  expect(br.rows[0]?.amountMinor).toBe(123400);
  const en = await parse(csvWith('1,234') + '\n16/10/2026;Outra loja;12.34;Saída;BRL');
  expect(en.rows[0]?.amountMinor).toBe(123400);
  await rejectsWith(csvWith('1.234'), 'statement_csv_ambiguous_amount');
  await rejectsWith(csvWith('1,234'), 'statement_csv_ambiguous_amount');
  await rejectsWith(
    csvWith('1.234') + '\n16/10/2026;Outra loja;12.34;Saída;BRL',
    'statement_csv_ambiguous_amount',
  );
});

test('separate debit and credit columns establish direction, including empty/zero sides', async () => {
  const result = await parse(
    'data;historico;debito;credito;moeda\n16/10/2026;Loja;12,34;;BRL\n16/10/2026;Salário;0;100,01;BRL\n16/10/2026;Depósito;-;10,00;BRL',
  );
  expect(result.rows).toMatchObject([
    { amountMinor: 1234, kind: 'expense' },
    { amountMinor: 10001, kind: 'income' },
    { amountMinor: 1000, kind: 'income' },
  ]);
  await rejectsWith(
    'data;historico;debito;credito\n16/10/2026;Loja;12,34;10,00',
    'statement_csv_ambiguous_amount',
  );
  await rejectsWith(
    'data;historico;debito;credito\n16/10/2026;Loja;;-10,00',
    'statement_csv_ambiguous_amount',
  );
});

test.each([
  ['Transferência', 'Entre contas próprias', 'transfer'],
  ['Saída', 'Pagamento de fatura do cartão', 'card_payment'],
  ['card_payment', 'Fatura mensal', 'card_payment'],
  ['unknown', 'Transação a revisar', 'unknown'],
  ['Entrada', 'Empréstimo recebido', 'unknown'],
  ['Entrada', 'Estorno de compra', 'unknown'],
] as const)(
  'keeps negative %s amounts positive while preserving special kind %s',
  async (type, description, expectedKind) => {
    const result = await parse(
      `Data;Historico;Valor;Tipo;Moeda\n16/10/2026;${description};-12,34;${type};BRL`,
    );
    expect(result.rows[0]).toMatchObject({ amountMinor: 1234, kind: expectedKind });
  },
);

test('does not invent a transfer from Pix or ordinary purchases on cards', async () => {
  expect((await parse(csvWith('-12,34', 'Pix'))).rows[0]?.kind).toBe('expense');
  expect(
    (await parse('Data,Descricao,Valor\n2026-10-16,Mercado ficticio,12.34', { sourceKind: 'card' }))
      .rows[0]?.kind,
  ).toBe('expense');
  const refund = await parse('Data,Descricao,Valor\n2026-10-16,Mercado ficticio,-12.34', {
    sourceKind: 'card',
  });
  expect(refund.rows[0]?.kind).toBe('unknown');
  const unsigned = await parse('Data,Descricao,Valor\n2026-10-16,Operação indefinida,12.34');
  expect(unsigned.rows[0]?.kind).toBe('unknown');
});

test('Nubank card titles and explicit card credits never become bank income', async () => {
  const result = await parse(
    'data,título,valor\n2026-10-16,Mercado fictício,12.34\n2026-10-16,Estorno de compra,-12.34',
    { sourceKind: 'card' },
  );
  expect(result.rows).toMatchObject([
    { kind: 'expense', amountMinor: 1234 },
    { kind: 'unknown', amountMinor: 1234 },
  ]);
  expect((await parse(csvWith('12,34', 'Crédito'), { sourceKind: 'card' })).rows[0]?.kind).toBe(
    'unknown',
  );
  expect((await parse(csvWith('-12,34', 'Despesa'), { sourceKind: 'card' })).rows[0]?.kind).toBe(
    'expense',
  );
  expect((await parse(csvWith('+12,34', 'Despesa'), { sourceKind: 'card' })).rows[0]?.kind).toBe(
    'expense',
  );
});

test('composes type and explicit origin/destination without inventing descriptions', async () => {
  const result = await parse(
    'data;origem;destino;valor;tipo\n16/10/2026;Conta origem;Loja destino;-12,34;Saída',
  );
  expect(result.rows[0]?.description).toBe('Saída - Conta origem / Loja destino');
  await rejectsWith('data;origem;valor;tipo\n16/10/2026;;12,34;Saída', 'statement_csv_invalid');
});

test('processes all 100 records without a model, truncation or invented balances', async () => {
  const result = await parse(
    'data,hora,tipo,"origem / destino",valor,"forma de pagamento"\n' +
      Array.from(
        { length: 100 },
        (_, index) => `16/10/2026,12:00,Saída,Loja sintética ${index},"-R$ ${index + 1},29",Pix`,
      ).join('\n'),
  );
  expect(result.rows).toHaveLength(100);
  expect(result.rows[99]).toMatchObject({
    description: 'Saída - Loja sintética 99',
    amountMinor: 10029,
  });
  expect(result.closingBalanceMinor).toBeNull();
  expect(result.balanceOn).toBeNull();
  await rejectsWith(
    csvWith('-12,34') + '\n16/10/2026;Outra loja;-12,34;Saída;BRL'.repeat(100),
    'statement_csv_too_many_rows',
  );
});

test.each([
  '2026-02-29',
  '31/04/2026',
  '29-02-1900',
  '01/01/26',
  '2026-1-01',
  '15/13/2026',
  '00/10/2026',
  '0000-01-01',
])('rejects invalid date %s', async (date) => {
  await rejectsWith(csvWith('-12,34', 'Saída', date), 'statement_csv_invalid_date');
});
test('accepts real leap days', async () => {
  expect((await parse(csvWith('-12,34', 'Saída', '29/02/2000'))).rows[0]?.occurredOn).toBe(
    '2000-02-29',
  );
});

test.each(['USD', 'EUR', 'US$', '€', '$', 'GBP'])(
  'rejects explicit foreign currency %s',
  async (currency) => {
    await rejectsWith(
      csvWith('-12,34', 'Saída', '16/10/2026', currency),
      'statement_csv_unsupported_currency',
    );
    await rejectsWith(csvWith(`${currency} 12,34`), 'statement_csv_unsupported_currency');
  },
);

test.each([
  '0',
  '-0,00',
  '10000000000,01',
  '10000000001',
  '1-2',
  '12,3456',
  '1.23,45',
  '-12,34 C',
  '+12,34 D',
])('rejects zero, out-of-range, malformed or ambiguous amount %s', async (amount) => {
  await expect(parse(csvWith(amount))).rejects.toBeInstanceOf(AppError);
});

test.each([
  'data;historico;valor;tipo\n16/10/2026;"Unclosed;12,34;Saída',
  'data;historico;valor;tipo\n16/10/2026;"Closed"junk;12,34;Saída',
  'data;historico;valor;tipo\n16/10/2026;bad"quote;12,34;Saída',
  'data;historico;valor;tipo\n16/10/2026;Loja;12,34;Saída;extra',
  'data;historico;valor;tipo\n16/10/2026;Loja;12,34',
  'data;historico;valor;tipo',
])('rejects malformed records without exposing their contents', async (csv) => {
  await rejectsWith(csv, 'statement_csv_invalid');
});

test.each([
  'data;valor\n16/10/2026;12,34',
  'historico;valor\nLoja;12,34',
  'data;historico\n16/10/2026;Loja',
  'data;historico;valor;amount\n16/10/2026;Loja;12,34;12,34',
  'data;historico;valor;debito\n16/10/2026;Loja;12,34;12,34',
])('validates supported headers before attempting transactions', async (csv) => {
  await rejectsWith(csv, 'statement_csv_unsupported_columns');
});

test('rejects disabled document formats and invalid/binary encodings safely', async () => {
  await expect(parse(csvWith('-12,34'), { format: 'pdf' })).rejects.toMatchObject({
    code: 'statement_format_disabled',
  });
  await expect(parse(csvWith('-12,34'), { format: 'xlsx' })).rejects.toMatchObject({
    code: 'statement_format_disabled',
  });
  await expect(extractor.extract(job, Buffer.from([0xff, 0xfe, 0x61]))).rejects.toMatchObject({
    code: 'statement_csv_invalid_encoding',
  });
  await expect(
    extractor.extract(job, Buffer.from('data;historico;valor\n16/10/2026;\u0000;12,34')),
  ).rejects.toMatchObject({ code: 'statement_csv_invalid_encoding' });
});

test('preserves categories and rejects data beyond the review contract instead of truncating', async () => {
  const result = await parse(
    'data;historico;valor;tipo;categoria;identificador\n16/10/2026;Loja;-12,34;Saída;mercado;bank-id',
  );
  expect(result.rows[0]).toMatchObject({ category: 'mercado', externalId: 'bank-id' });
  await rejectsWith(
    `data;historico;valor;tipo\n16/10/2026;${'a'.repeat(201)};-12,34;Saída`,
    'statement_csv_invalid',
  );
  await rejectsWith(
    `data;historico;valor;tipo;identificador\n16/10/2026;Loja;-12,34;Saída;${'a'.repeat(121)}`,
    'statement_csv_invalid',
  );
});
