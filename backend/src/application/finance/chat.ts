import { createHash } from 'node:crypto';
import { localDateInZone, periodOf } from '../../domain/finance/calendar.js';
import { parseAmountMinor } from '../../domain/finance/money.js';
import type { FinanceEntry } from '../../domain/finance/model.js';
import type { SkillResult } from '../../domain/skills/definition.js';
import type { PendingSkillOperationRepository } from '../ports/pending-skill-operation.js';
import type { Clock, IdGenerator } from '../ports/runtime.js';
import type { SkillTurn, SkillTurnHandler } from '../skills/runtime.js';
import { requiresSkillConfirmation } from '../skills/tool-view.js';
import { explainFinances } from './analysis.js';
import type { FinanceLedger } from './ledger.js';
import type { FinancialPlanning } from './planning.js';

export interface FinanceChatDeps {
  planning?: FinancialPlanning;
  ledger: FinanceLedger;
  pending: PendingSkillOperationRepository;
  clock: Clock;
  ids: IdGenerator;
  timezone: string;
}

export function financeChatHandler(deps: FinanceChatDeps): SkillTurnHandler {
  return {
    skillId: 'finance',
    handle: (turn) => handleFinanceChat(deps, turn),
  };
}

export async function handleFinanceChat(
  deps: FinanceChatDeps,
  turn: SkillTurn,
): Promise<SkillResult | null> {
  const text = normalize(turn.message);
  if (isOutOfScope(text)) return refuseFinance();
  const occurredOn = localDateInZone(turn.now, deps.timezone);
  if (
    deps.planning &&
    /\b(plano financeiro|quanto (?:eu )?posso gastar|quanto (?:tenho|esta|ta) livre|me organizar financeiramente)\b/.test(
      text,
    )
  )
    return deps.planning.chat(turn.userId, turn.assistantId);
  if (deps.planning && /\b(posso|cabe|consigo)\b.*\b(comprar|compra|comprando)\b/.test(text)) {
    const found = text.match(/r\$\s*(\d+(?:[.,]\d+)*)|(\d+(?:[.,]\d+)*)\s*(?:reais|real)\b/);
    if (!found) return ask(['o valor total da compra em reais e se será à vista ou parcelada']);
    const installment = text.match(/\b(?:em\s+)?(\d+)\s*(?:x|vezes|parcelas)\b/);
    return deps.planning.chat(turn.userId, turn.assistantId, {
      amountMinor: parseAmountMinor(found[1] ?? found[2]!),
      currency: 'BRL',
      purpose: /\b(lazer|cinema|passeio|jogo)\b/.test(text) ? 'leisure' : 'general',
      installments: Number(installment?.[1] ?? 1),
    });
  }
  const expense = matchExpense(text);
  if (expense) return recordExplicit(deps, turn, expense, 'expense', occurredOn);
  const income = matchIncome(text);
  if (income && /\b(emprestimo|credito|limite|cheque especial)\b/.test(text))
    return {
      skillId: 'finance',
      facts: [
        {
          id: 'borrowed-money',
          statement: 'Esse crédito precisa ser tratado como dívida, sem aumentar sua renda mensal.',
        },
      ],
      calculated: [],
      explanations: [
        'Confirme o saldo atual separadamente, sem contar limite ainda não usado como dinheiro disponível.',
      ],
      missing: ['o credor e as condições desse crédito'],
      proposedActions: [],
      tone: { intensity: 'gentle', allowSarcasm: false },
    };
  if (income) return recordExplicit(deps, turn, income, 'income', occurredOn);
  const query = matchQuery(text);
  if (query !== undefined) return answerQuery(deps, turn, query, occurredOn);
  const correction = matchCorrection(text);
  if (correction) return correctPurchase(deps, turn, correction);
  const budget = matchBudget(text);
  if (budget) return setLimit(deps, turn, budget, occurredOn);
  return null;
}

async function recordExplicit(
  deps: FinanceChatDeps,
  turn: SkillTurn,
  found: { amount: string; currency: string | null; category: string | null },
  kind: 'income' | 'expense',
  occurredOn: string,
): Promise<SkillResult> {
  const missing = [found.currency ? '' : 'moeda', found.category ? '' : 'categoria'].filter(
    Boolean,
  );
  if (missing.length > 0) return ask(missing);
  if (requiresSkillConfirmation('record_explicit_expense', 'WRITE')) return ask(['confirmação']);
  const amountMinor = parseAmountMinor(found.amount);
  const currency = currencyOf(found.currency ?? '');
  const saved = await deps.ledger.recordEntry({
    userId: turn.userId,
    assistantId: turn.assistantId,
    kind,
    amountMinor,
    currency,
    categoryId: found.category ?? 'outros',
    occurredOn,
    timezone: deps.timezone,
    idempotencyKey: digest([turn.userId, turn.assistantId, kind, turn.message, occurredOn]),
    origin: 'chat',
  });
  return {
    skillId: 'finance',
    facts: [
      {
        id: saved.entry.id,
        statement: saved.created
          ? `Registrei ${kind === 'expense' ? 'a despesa' : 'a receita'} de ${found.category}.`
          : 'Esse lançamento já estava registrado.',
      },
    ],
    calculated: [
      {
        id: 'amount',
        label: found.category ?? 'lançamento',
        amountMinor,
        currency,
      },
    ],
    explanations: [
      'O valor foi lido da mensagem e guardado em centavos, sem investimento nem pagamento.',
    ],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'casual', allowSarcasm: false },
  };
}

async function answerQuery(
  deps: FinanceChatDeps,
  turn: SkillTurn,
  category: string | null,
  occurredOn: string,
): Promise<SkillResult> {
  const period = periodOf(occurredOn);
  if (!category) return explainFinances(deps.ledger, { ...turn, period });
  const entries = (await deps.ledger.listEntries(turn.userId, turn.assistantId)).filter(
    (entry) =>
      entry.status === 'active' &&
      entry.kind === 'expense' &&
      entry.categoryId === category &&
      entry.occurredOn.startsWith(period),
  );
  if (entries.length === 0) {
    return {
      skillId: 'finance',
      facts: [{ id: 'empty', statement: `Não há despesas de ${category} em ${period}.` }],
      calculated: [],
      explanations: ['Não vou completar esse total com uma estimativa.'],
      missing: [],
      proposedActions: [],
      tone: { intensity: 'measured', allowSarcasm: false },
    };
  }
  const currencies = [...new Set(entries.map((entry) => entry.currency))];
  return {
    skillId: 'finance',
    facts: [{ id: 'source', statement: `Soma das despesas ativas de ${category} em ${period}.` }],
    calculated: currencies.map((currency) => ({
      id: `spent-${currency}`,
      label: `${category} em ${currency}`,
      amountMinor: entries
        .filter((entry) => entry.currency === currency)
        .reduce((total, entry) => total + entry.amountMinor, 0),
      currency,
    })),
    explanations: [
      'Cada moeda foi somada separado. A origem são os lançamentos ativos dessa categoria.',
    ],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'measured', allowSarcasm: false },
  };
}

async function correctPurchase(
  deps: FinanceChatDeps,
  turn: SkillTurn,
  found: { next: string; previous: string },
): Promise<SkillResult> {
  const nextMinor = parseAmountMinor(found.next);
  const previousMinor = parseAmountMinor(found.previous);
  const matches = (await deps.ledger.listEntries(turn.userId, turn.assistantId)).filter(
    (entry) =>
      entry.status === 'active' && entry.kind === 'expense' && entry.amountMinor === previousMinor,
  );
  if (matches.length === 1) {
    const current = matches[0];
    if (!current) return ask(['lançamento']);
    const corrected = await deps.ledger.correctEntry(
      turn.userId,
      turn.assistantId,
      current.id,
      nextMinor,
      digest([turn.userId, current.id, String(nextMinor)]),
    );
    return {
      skillId: 'finance',
      facts: [
        { id: corrected.id, statement: 'Corrigi o lançamento único que tinha o valor anterior.' },
      ],
      calculated: [
        {
          id: 'amount',
          label: corrected.categoryId,
          amountMinor: nextMinor,
          currency: corrected.currency,
        },
      ],
      explanations: ['A despesa antiga saiu da soma. Não criei um segundo lançamento ativo.'],
      missing: [],
      proposedActions: [],
      tone: { intensity: 'measured', allowSarcasm: false },
    };
  }
  if (matches.length === 0) return ask(['qual lançamento']);
  return askWhich(deps, turn, matches, nextMinor);
}

async function setLimit(
  deps: FinanceChatDeps,
  turn: SkillTurn,
  found: { category: string; amount: string; currency: string | null },
  occurredOn: string,
): Promise<SkillResult> {
  const currency = found.currency ? currencyOf(found.currency) : await soleCurrency(deps, turn);
  if (!currency) return ask(['moeda']);
  const period = periodOf(occurredOn);
  const limitMinor = parseAmountMinor(found.amount);
  await deps.ledger.setBudget({
    userId: turn.userId,
    assistantId: turn.assistantId,
    categoryId: found.category,
    period,
    limitMinor,
    currency,
    idempotencyKey: digest([turn.userId, turn.assistantId, found.category, period, currency]),
  });
  return {
    skillId: 'finance',
    facts: [{ id: 'budget', statement: `Limite de ${found.category} em ${period}.` }],
    calculated: [
      { id: 'limit', label: `Limite de ${found.category}`, amountMinor: limitMinor, currency },
    ],
    explanations: [
      found.currency
        ? 'A moeda veio da mensagem.'
        : `Usei ${currency} porque é a única moeda já registrada. Isso não move dinheiro.`,
    ],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'casual', allowSarcasm: false },
  };
}

async function askWhich(
  deps: FinanceChatDeps,
  turn: SkillTurn,
  matches: FinanceEntry[],
  nextMinor: number,
): Promise<SkillResult> {
  const now = deps.clock.now().toISOString();
  for (const entry of matches) {
    await deps.pending.put({
      id: deps.ids.next(),
      userId: turn.userId,
      assistantId: turn.assistantId,
      conversationId: turn.conversationId,
      skillId: 'finance',
      name: 'correct_expense',
      summary: `corrigir ${entry.categoryId}`,
      payload: { entryId: entry.id, amountMinor: nextMinor },
      expiresAt: new Date(deps.clock.now().getTime() + 10 * 60 * 1000).toISOString(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }
  return {
    skillId: 'finance',
    facts: [{ id: 'ambiguous', statement: 'Há mais de um lançamento com o valor antigo.' }],
    calculated: [],
    explanations: ['Não corrigi nenhum. Um sim sozinho não escolhe entre eles.'],
    missing: ['qual lançamento'],
    proposedActions: [{ id: 'confirm', label: 'Diz qual lançamento corrigir.', kind: 'ask' }],
    tone: { intensity: 'measured', allowSarcasm: false },
  };
}

async function soleCurrency(deps: FinanceChatDeps, turn: SkillTurn): Promise<string | null> {
  const currencies = new Set(
    (await deps.ledger.listEntries(turn.userId, turn.assistantId))
      .filter((entry) => entry.status === 'active')
      .map((entry) => entry.currency),
  );
  if (currencies.size !== 1) return null;
  return [...currencies][0] ?? null;
}

function ask(missing: string[]): SkillResult {
  return {
    skillId: 'finance',
    facts: [],
    calculated: [],
    explanations: ['Não vou inventar o que faltou nem registrar um pagamento.'],
    missing,
    proposedActions: [],
    tone: { intensity: 'measured', allowSarcasm: false },
  };
}

function refuseFinance(): SkillResult {
  return {
    skillId: 'finance',
    facts: [
      { id: 'scope', statement: 'Neste momento eu só registro e consulto finanças pessoais.' },
    ],
    calculated: [],
    explanations: ['Não faço investimento, pagamento ou movimentação bancária.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'measured', allowSarcasm: false },
  };
}

function matchExpense(text: string) {
  const match = text.match(
    /(?:gastei|paguei|comprei)\s+([\d.,]+)\s*(reais|real|r\$|dolares|dolar|euros|euro)?(?:\s+(?:no|na|em|com|de)\s+([a-z]+))?/,
  );
  if (!match) return null;
  return { amount: match[1] ?? '', currency: match[2] ?? null, category: match[3] ?? null };
}

function matchIncome(text: string) {
  const match = text.match(
    /(?:recebi|ganhei)\s+([\d.,]+)\s*(reais|real|r\$|dolares|dolar|euros|euro)?(?:\s+(?:de|com)\s+([a-z]+))?/,
  );
  if (!match) return null;
  return { amount: match[1] ?? '', currency: match[2] ?? null, category: match[3] ?? 'receita' };
}

function matchQuery(text: string): string | null | undefined {
  if (!text.includes('quanto gastei')) return undefined;
  const match = text.match(/quanto gastei(?:\s+com\s+([a-z]+))?/);
  return match?.[1] ?? null;
}

function matchCorrection(text: string) {
  const match = text.match(
    /(?:essa compra|esse gasto|essa despesa) foi\s+(\d+(?:[.,]\d+)*)\s*,?\s*nao\s+(\d+(?:[.,]\d+)*)/,
  );
  if (!match) return null;
  return { next: match[1] ?? '', previous: match[2] ?? '' };
}

function matchBudget(text: string) {
  const match = text.match(/limit[ae]\s+([a-z]+)\s+a\s+([\d.,]+)(?:\s+(reais|real))?\s+por mes/);
  if (!match) return null;
  return { category: match[1] ?? '', amount: match[2] ?? '', currency: match[3] ?? null };
}

function isOutOfScope(text: string): boolean {
  return /\b(investir|investimento|bolsa|pagar o boleto|pagar a conta|transferir|aplicacao)\b/.test(
    text,
  );
}

function currencyOf(token: string): string {
  if (token === 'reais' || token === 'real' || token === 'r$') return 'BRL';
  if (token === 'dolares' || token === 'dolar') return 'USD';
  if (token === 'euros' || token === 'euro') return 'EUR';
  return 'BRL';
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function digest(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}
