import type { StatementExtractor } from '../../../application/ports/statement.js';
import { AppError } from '../../../domain/errors/app-error.js';
import {
  extractedStatementSchema,
  type ExtractedStatement,
  type StatementJob,
  type StatementRow,
} from '../../../domain/finance/statement.js';

type Direction = 'income' | 'expense';
type Locale = 'br' | 'en';
type Column =
  | 'date'
  | 'description'
  | 'origin'
  | 'destination'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'type'
  | 'currency'
  | 'externalId'
  | 'category';
type Columns = Partial<Record<Column, number>>;
type MoneyToken = { number: string; direction?: Direction; hasCurrency: boolean };
const MAX_MINOR = 1_000_000_000_000n;
const WINDOWS_1252_CONTROLS = [
  '€',
  undefined,
  '‚',
  'ƒ',
  '„',
  '…',
  '†',
  '‡',
  'ˆ',
  '‰',
  'Š',
  '‹',
  'Œ',
  undefined,
  'Ž',
  undefined,
  undefined,
  '‘',
  '’',
  '“',
  '”',
  '•',
  '–',
  '—',
  '˜',
  '™',
  'š',
  '›',
  'œ',
  undefined,
  'ž',
  'Ÿ',
];

function fail(code = 'statement_csv_invalid'): never {
  throw new AppError(code, 422);
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decode(bytes: Uint8Array): string {
  let encoding = 'utf-8';
  const utf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    if (encoding !== 'utf-8' || utf8Bom) fail('statement_csv_invalid_encoding');
    // Do not depend on the host ICU build's mapping of the Windows-1252 C1 range.
    text = Buffer.from(bytes)
      .toString('latin1')
      .replace(/[\u0080-\u009f]/g, (char) => {
        const mapped = WINDOWS_1252_CONTROLS[char.charCodeAt(0) - 0x80];
        if (!mapped) fail('statement_csv_invalid_encoding');
        return mapped;
      });
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0xfffd
    )
      fail('statement_csv_invalid_encoding');
  }
  return text.replace(/^\uFEFF/, '');
}

function delimiterFor(text: string): string {
  const counts = new Map([
    [',', 0],
    [';', 0],
    ['\t', 0],
  ]);
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === '\n' || char === '\r') break;
      if (counts.has(char)) counts.set(char, counts.get(char)! + 1);
    }
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (!ranked[0]?.[1] || ranked[0][1] === ranked[1]?.[1]) fail('statement_csv_unsupported_columns');
  return ranked[0][0];
}

/** RFC-style records, with quoted commas, escaped quotes and embedded newlines. */
function records(text: string, delimiter: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  const endField = () => {
    row.push(field);
    field = '';
    closedQuote = false;
  };
  const endRecord = () => {
    endField();
    if (row.some((value) => value.trim())) result.push(row);
    row = [];
    if (result.length > 101) fail('statement_csv_too_many_rows');
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else field += char;
    } else if (char === delimiter) endField();
    else if (char === '\r' || char === '\n') {
      endRecord();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (closedQuote) {
      if (char !== ' ' && char !== '\t') fail();
    } else if (char === '"') {
      if (field.trim()) fail();
      field = '';
      quoted = true;
    } else field += char;
  }
  if (quoted) fail();
  endRecord();
  return result;
}

const aliases: Record<Column, readonly string[]> = {
  date: [
    'data',
    'date',
    'data lancamento',
    'data de lancamento',
    'data transacao',
    'data da transacao',
    'data movimentacao',
    'occurredon',
    'occurred on',
  ],
  description: [
    'descricao',
    'description',
    'historico',
    'historico lancamento',
    'lancamento',
    'estabelecimento',
    'titulo',
    'origem destino',
  ],
  origin: ['origem', 'origin'],
  destination: ['destino', 'destination', 'favorecido', 'beneficiario'],
  amount: [
    'valor',
    'amount',
    'valor transacao',
    'valor da transacao',
    'valor lancamento',
    'valor movimentacao',
    'valor r',
    'valor brl',
    'valor em reais',
  ],
  debit: ['debito', 'debit', 'valor debito', 'valor do debito', 'saida'],
  credit: ['credito', 'credit', 'valor credito', 'valor do credito', 'entrada'],
  type: [
    'tipo',
    'type',
    'natureza',
    'tipo transacao',
    'tipo de transacao',
    'tipo lancamento',
    'debito credito',
    'entrada saida',
    'd c',
    'direction',
  ],
  currency: ['moeda', 'currency'],
  externalId: ['identificador', 'id', 'transaction id', 'id transacao', 'identificador transacao'],
  category: ['categoria', 'category'],
};

function columnsFor(header: string[]): Columns {
  const columns: Columns = {};
  const seen = new Set<string>();
  for (const [index, value] of header.entries()) {
    const name = normalized(value);
    if (!name || seen.has(name)) fail('statement_csv_unsupported_columns');
    seen.add(name);
    const entry = (Object.entries(aliases) as [Column, readonly string[]][]).find(([, names]) =>
      names.includes(name),
    );
    if (entry) {
      if (columns[entry[0]] !== undefined) fail('statement_csv_unsupported_columns');
      columns[entry[0]] = index;
    }
  }
  if (
    columns.date === undefined ||
    (columns.description === undefined &&
      columns.origin === undefined &&
      columns.destination === undefined) ||
    (columns.amount === undefined && columns.debit === undefined && columns.credit === undefined)
  )
    fail('statement_csv_unsupported_columns');
  if (columns.amount !== undefined && (columns.debit !== undefined || columns.credit !== undefined))
    fail('statement_csv_unsupported_columns');
  return columns;
}

function dateFor(raw: string): string {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const brazilian = /^(\d{2})([/-])(\d{2})\2(\d{4})$/.exec(value);
  const year = Number(iso?.[1] ?? brazilian?.[4]);
  const month = Number(iso?.[2] ?? brazilian?.[3]);
  const day = Number(iso?.[3] ?? brazilian?.[1]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    (!iso && !brazilian) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1]!
  )
    fail('statement_csv_invalid_date');
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function currencyFor(value: string): boolean {
  if (!value.trim()) return false;
  if (!/^(?:BRL|R\$|REAIS|REAL)$/i.test(value.trim())) fail('statement_csv_unsupported_currency');
  return true;
}

function tokenizeMoney(raw: string): MoneyToken {
  // Financial exports use the mathematical minus (U+2212), not only ASCII '-'.
  let value = raw
    .replace(/[\u2212\uff0d]/g, '-')
    .replace(/\uff0b/g, '+')
    .trim();
  if (!value) fail();
  let direction: Direction | undefined;
  const setDirection = (next: Direction) => {
    if (direction && direction !== next) fail('statement_csv_ambiguous_amount');
    direction = next;
  };
  // Remove only recognized BRL markers. Any other letters/symbols remain invalid.
  const hasCurrency = /R\$|\bBRL\b/i.test(value);
  value = value.replace(/R\$|\bBRL\b/gi, '').trim();
  if (/[A-Z]{3}|[$€£¥]|\b(?:DOLAR(?:ES)?|EUROS?)\b/i.test(value))
    fail('statement_csv_unsupported_currency');
  const suffix = /\s*([DC])\s*$/i.exec(value);
  if (suffix) {
    setDirection(suffix[1]!.toUpperCase() === 'D' ? 'expense' : 'income');
    value = value.slice(0, suffix.index).trim();
  }
  if (value.startsWith('(') && value.endsWith(')')) {
    setDirection('expense');
    value = value.slice(1, -1).trim();
  }
  if (/^[+-]/.test(value)) {
    setDirection(value[0] === '-' ? 'expense' : 'income');
    value = value.slice(1).trim();
  }
  if (value.endsWith('-')) {
    setDirection('expense');
    value = value.slice(0, -1).trim();
  }
  if (/\s/u.test(value)) {
    if (!/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?$/u.test(value)) fail();
    value = value.replace(/[ \u00a0\u202f]/g, '');
  }
  if (!/^\d+(?:[.,]\d+)*$/.test(value)) fail();
  return { number: value, ...(direction ? { direction } : {}), hasCurrency };
}

function localeFor(tokens: MoneyToken[]): Locale | undefined {
  const styles = new Set<Locale>();
  for (const { number } of tokens) {
    const comma = number.lastIndexOf(',');
    const dot = number.lastIndexOf('.');
    const last = Math.max(comma, dot);
    if (last < 0) continue;
    if (number.length - last - 1 <= 2) styles.add(comma > dot ? 'br' : 'en');
  }
  return styles.size === 1 ? [...styles][0] : undefined;
}

function minorFor(token: MoneyToken, locale: Locale | undefined): number {
  const value = token.number;
  const comma = value.lastIndexOf(',');
  const dot = value.lastIndexOf('.');
  const last = Math.max(comma, dot);
  let integer = value;
  let decimal = '00';
  if (last >= 0) {
    const separator = value[last]!;
    const fraction = value.slice(last + 1);
    const both = comma >= 0 && dot >= 0;
    if (fraction.length <= 2) {
      integer = value.slice(0, last);
      decimal = fraction.padEnd(2, '0');
      const grouping = separator === ',' ? '.' : ',';
      if (!/^\d+$/.test(integer) && !new RegExp(`^\\d{1,3}(?:\\${grouping}\\d{3})+$`).test(integer))
        fail('statement_csv_ambiguous_amount');
      integer = integer.replace(/[.,]/g, '');
    } else {
      if (both || fraction.length !== 3) fail('statement_csv_ambiguous_amount');
      const count = value.split(separator).length - 1;
      const matchesLocale =
        (separator === '.' && locale === 'br') || (separator === ',' && locale === 'en');
      if (count === 1 && !matchesLocale) fail('statement_csv_ambiguous_amount');
      if (!new RegExp(`^\\d{1,3}(?:\\${separator}\\d{3})+$`).test(value))
        fail('statement_csv_ambiguous_amount');
      integer = value.replace(/[.,]/g, '');
    }
  }
  integer = integer.replace(/^0+(?=\d)/, '');
  if (integer.length > 11) fail();
  const minor = BigInt(integer) * 100n + BigInt(decimal);
  if (minor > MAX_MINOR) fail();
  return Number(minor);
}

function explicitDirection(type: string): Direction | undefined {
  const value = normalized(type);
  if (/^(?:entrada|receita|credito|credit|income|recebimento|deposito|c)$/.test(value))
    return 'income';
  if (/^(?:saida|despesa|debito|debit|expense|compra|pagamento|saque|retirada|d)$/.test(value))
    return 'expense';
  return undefined;
}

function specialKind(
  type: string,
  description: string,
  warnings: Set<string>,
): StatementRow['kind'] | undefined {
  const label = normalized(type);
  const text = normalized(`${type} ${description}`);
  if (
    /\b(?:card payment|pagamento (?:da |de )?fatura|pagto (?:da |de )?fatura|liquidacao (?:da |de )?fatura|pagamento (?:de |do )?cartao)\b/.test(
      text,
    )
  )
    return 'card_payment';
  if (
    /\b(?:emprestimo|financiamento|credito pessoal|estorno|reembolso|refund)\b/.test(text) ||
    label === 'unknown' ||
    label === 'desconhecido'
  ) {
    warnings.add('Há empréstimo, estorno ou operação ambígua: escolha o tipo antes de confirmar.');
    return 'unknown';
  }
  if (
    /\b(?:transferencia|transfer)\b/.test(label) ||
    /\btransferencia\b.*\b(?:contas proprias|minhas contas|entre contas|minha conta)\b/.test(text)
  ) {
    warnings.add('Confira se as transferências identificadas são entre contas próprias.');
    return 'transfer';
  }
  if (/\btransferencia\b/.test(text)) {
    warnings.add(
      'Há transferência sem indicação de contas próprias: escolha o tipo antes de confirmar.',
    );
    return 'unknown';
  }
  return undefined;
}

export class CsvStatementExtractor implements StatementExtractor {
  async extract(job: StatementJob, bytes: Uint8Array): Promise<ExtractedStatement> {
    if (job.format !== 'csv') fail('statement_format_disabled');
    let text = decode(bytes).replace(/^(?:[ \t]*\r?\n)+/, '');
    const directive = /^sep=([,;\t])(?:\r\n|\n|\r)/i.exec(text);
    if (directive) text = text.slice(directive[0].length);
    const parsed = records(text, directive?.[1] ?? delimiterFor(text));
    if (parsed.length < 2) fail();
    const header = parsed[0]!;
    const columns = columnsFor(header);
    const get = (row: string[], column: Column) =>
      columns[column] === undefined ? '' : row[columns[column]!]!.trim();
    const data = parsed.slice(1);
    if (data.some((row) => row.length !== header.length)) fail();
    const warnings = new Set<string>();
    const monies = data.map((row) => {
      const currency = currencyFor(get(row, 'currency'));
      const money = columns.amount !== undefined ? tokenizeMoney(get(row, 'amount')) : undefined;
      const split = (column: 'debit' | 'credit') => {
        const value = get(row, column);
        return value && value !== '-' ? tokenizeMoney(value) : undefined;
      };
      const debit = money ? undefined : split('debit');
      const credit = money ? undefined : split('credit');
      if (
        !currency &&
        !money?.hasCurrency &&
        !debit?.hasCurrency &&
        !credit?.hasCurrency &&
        !/R\$|\bBRL\b|reais/i.test(header[columns.amount ?? columns.debit ?? columns.credit!]!)
      )
        warnings.add('Moeda ausente no CSV: BRL foi assumido; confira a moeda antes de confirmar.');
      return { money, debit, credit };
    });
    const tokens = monies.flatMap(({ money, debit, credit }) =>
      [money, debit, credit].filter((value): value is MoneyToken => value !== undefined),
    );
    const locale = localeFor(tokens);
    const signedBankLayout =
      columns.externalId !== undefined || tokens.some((token) => token.direction !== undefined);
    const rows = data.map((row, index): StatementRow => {
      const date = dateFor(get(row, 'date'));
      const type = get(row, 'type');
      const originalDescription = get(row, 'description');
      const origin = get(row, 'origin');
      const destination = get(row, 'destination');
      const combinedOriginColumn =
        normalized(header[columns.description ?? -1] ?? '') === 'origem destino';
      const description =
        originalDescription && !combinedOriginColumn
          ? originalDescription
          : [type, originalDescription || [origin, destination].filter(Boolean).join(' / ')]
              .filter(Boolean)
              .join(' - ');
      if (!originalDescription && !origin && !destination) fail();
      if (description.length > 200) fail();
      const { money, debit, credit } = monies[index]!;
      let direction: Direction | undefined;
      let amountMinor: number;
      if (money) {
        amountMinor = minorFor(money, locale);
        direction = money.direction;
      } else {
        const debitMinor = debit ? minorFor(debit, locale) : 0;
        const creditMinor = credit ? minorFor(credit, locale) : 0;
        if (
          (debitMinor > 0 && creditMinor > 0) ||
          debit?.direction === 'income' ||
          credit?.direction === 'expense'
        )
          fail('statement_csv_ambiguous_amount');
        amountMinor = debitMinor || creditMinor;
        direction = debitMinor ? 'expense' : creditMinor ? 'income' : undefined;
      }
      if (amountMinor === 0) fail();
      let kind = specialKind(type, description, warnings);
      if (!kind) {
        const statedDirection = explicitDirection(type);
        if (job.sourceKind === 'card') {
          if (statedDirection === 'income' || (direction === 'expense' && !statedDirection)) {
            warnings.add(
              'Há crédito ou valor negativo no cartão: escolha o tipo antes de confirmar.',
            );
            kind = 'unknown';
          } else kind = 'expense';
        } else if (direction && statedDirection && direction !== statedDirection) {
          warnings.add(
            'Há conflito entre o tipo e o sinal do valor: escolha o tipo antes de confirmar.',
          );
          kind = 'unknown';
        } else if (statedDirection) kind = statedDirection;
        else if (direction) kind = direction;
        else if (signedBankLayout) kind = 'income';
        else {
          warnings.add(
            'Há valor sem direção de entrada ou saída: escolha o tipo antes de confirmar.',
          );
          kind = 'unknown';
        }
      }
      return {
        occurredOn: date,
        description,
        amountMinor,
        currency: 'BRL',
        kind,
        category: get(row, 'category') || 'sem_categoria',
        externalId: get(row, 'externalId') || null,
      };
    });
    const result = extractedStatementSchema.safeParse({
      complete: true,
      warnings: [...warnings],
      rows,
      closingBalanceMinor: null,
      balanceOn: null,
    });
    if (!result.success) fail();
    return result.data;
  }
}
