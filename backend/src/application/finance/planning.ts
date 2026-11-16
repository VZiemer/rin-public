import {
  calculatePlan,
  assessPurchase,
  planPatchSchema,
  debtSchema,
  purchaseSchema,
} from '../../domain/finance/planning.js';
import { localDateInZone } from '../../domain/finance/calendar.js';
import type { FinancialPlanningRepository } from '../ports/financial-planning.js';
import type { FinanceLedger } from './ledger.js';
import type { Clock } from '../ports/runtime.js';
import { AppError } from '../../domain/errors/app-error.js';
import type { SkillResult } from '../../domain/skills/definition.js';
import { totalsForPeriod } from '../../domain/finance/model.js';

export class FinancialPlanning {
  constructor(
    readonly repo: FinancialPlanningRepository,
    private ledger: FinanceLedger,
    private clock: Clock,
    private timezone: string,
  ) {}
  async update(user: string, assistant: string, input: unknown) {
    const patch = planPatchSchema.parse(input);
    const current = await this.repo.getPlan(user, assistant);
    const now = this.clock.now().toISOString();
    const cashPatch =
      patch.cashMinor === undefined
        ? {}
        : {
            balanceCapturedAt: now,
            captureEntryIds: (await this.ledger.listEntries(user, assistant))
              .filter((e) => e.recordedAt >= now || e.updatedAt >= now)
              .map((e) => e.id),
          };
    const record = {
      userId: user,
      assistantId: assistant,
      revision: (current?.revision ?? -1) + 1,
      updatedAt: now,
      ...(current?.balanceCapturedAt
        ? {
            balanceCapturedAt: current.balanceCapturedAt,
            captureEntryIds: current.captureEntryIds ?? [],
          }
        : {}),
      ...cashPatch,
      values: {
        ...current?.values,
        ...patch,
        ...(patch.cashMinor !== undefined && !patch.asOfOn
          ? { asOfOn: localDateInZone(this.clock.now(), this.timezone) }
          : {}),
      },
    };
    if (!(await this.repo.savePlan(record, current?.revision ?? null)))
      throw new AppError('financial_plan_conflict', 409);
    return record;
  }
  async saveDebt(user: string, assistant: string, input: unknown) {
    const debt = debtSchema.parse(input);
    await this.repo.saveDebt(user, assistant, debt);
    return debt;
  }
  async summary(user: string, assistant: string) {
    // Changes are calculated against a confirmed cash snapshot, never a credit limit.
    const [record, debts, bills] = await Promise.all([
      this.repo.getPlan(user, assistant),
      this.repo.listDebts(user, assistant),
      this.ledger.listBills(user, assistant),
    ]);
    const today = localDateInZone(this.clock.now(), this.timezone);
    const values = { ...record?.values };
    if (record?.balanceCapturedAt && values.cashMinor !== undefined) {
      const entries = await this.ledger.listEntries(user, assistant);
      const changed = entries.filter(
        (e) =>
          (e.recordedAt >= record.balanceCapturedAt! || e.updatedAt >= record.balanceCapturedAt!) &&
          !(record.captureEntryIds ?? []).includes(e.id),
      );
      if (
        changed.some(
          (e) =>
            e.origin !== 'chat' ||
            e.status !== 'active' ||
            e.occurredOn !== today ||
            e.currency !== 'BRL',
        )
      )
        return {
          status: 'needs_input' as const,
          missing: ['saldo atualizado após importação, correção ou lançamento de outra data/moeda'],
        };
      values.cashMinor += changed.reduce(
        (sum, e) => sum + (e.kind === 'income' ? e.amountMinor : -e.amountMinor),
        0,
      );
      for (const entry of changed.filter((e) => e.kind === 'expense')) {
        const bucket = values.spendingBuckets?.[entry.categoryId];
        if (bucket === 'essential' && values.essentialsUntilIncomeMinor !== undefined)
          values.essentialsUntilIncomeMinor = Math.max(
            0,
            values.essentialsUntilIncomeMinor - entry.amountMinor,
          );
        if (bucket === 'leisure' && values.leisureUntilIncomeMinor !== undefined)
          values.leisureUntilIncomeMinor = Math.max(
            0,
            values.leisureUntilIncomeMinor - entry.amountMinor,
          );
      }
    }
    return calculatePlan(values, debts, bills, today);
  }
  async purchase(user: string, assistant: string, input: unknown) {
    return assessPurchase(await this.summary(user, assistant), purchaseSchema.parse(input));
  }
  async observed(user: string, assistant: string) {
    // Only confirmed movements participate; pending extracted rows are excluded.
    const entries = (await this.ledger.listEntries(user, assistant)).filter(
      (e) => e.status === 'active' && e.currency === 'BRL',
    );
    const months = [...new Set(entries.map((e) => e.occurredOn.slice(0, 7)))].sort().slice(-3);
    return {
      status: 'observed_only',
      months: months.map((period) => ({
        period,
        totals: totalsForPeriod(entries, period),
        categories: [
          ...new Set(
            entries
              .filter((e) => e.occurredOn.startsWith(period) && e.kind === 'expense')
              .map((e) => e.categoryId),
          ),
        ].map((category) => ({
          category,
          amountMinor: entries
            .filter(
              (e) =>
                e.occurredOn.startsWith(period) &&
                e.kind === 'expense' &&
                e.categoryId === category,
            )
            .reduce((sum, e) => sum + e.amountMinor, 0),
        })),
      })),
      warnings: [
        'São lançamentos observados, não prova de cobertura completa de todas as contas ou renda futura.',
        'Confirme renda líquida, despesas essenciais, acordos e uma verba de lazer antes de aprovar o plano.',
      ],
    };
  }
  async reportBillPaid(user: string, assistant: string, id: string, on: string) {
    return this.ledger.reportBillPaid(user, assistant, id, on);
  }
  async chat(user: string, assistant: string, purchase?: unknown): Promise<SkillResult> {
    const plan = await this.summary(user, assistant);
    const base: SkillResult = {
      skillId: 'finance',
      facts: [],
      calculated: [],
      explanations: [],
      missing: [],
      proposedActions: [],
      tone: { intensity: 'gentle', allowSarcasm: false },
    };
    if (plan.status === 'needs_input') {
      const labels: Record<string, string> = {
        currency: 'a moeda do plano (reais)',
        asOfOn: 'a data do saldo informado',
        cashMinor: 'seu saldo disponível hoje, sem limite de cartão',
        nextIncomeOn: 'a data da próxima entrada',
        monthlyIncomeMinor: 'sua renda líquida mensal',
        incomeCertain: 'se essa renda está confirmada',
        essentialsUntilIncomeMinor:
          'quanto ainda precisa para despesas essenciais até a próxima entrada, sem repetir contas cadastradas',
        monthlyEssentialsMinor: 'seu custo essencial mensal, sem repetir contas cadastradas',
        leisureUntilIncomeMinor: 'uma verba realista de lazer até a próxima entrada',
        monthlyLeisureMinor: 'a verba mensal de lazer que quer preservar',
        bufferMinor: 'uma margem de segurança no saldo',
        monthlyReserveMinor: 'sua reserva mensal planejada',
        debtExtraUntilIncomeMinor: 'a verba adicional para dívidas até a próxima entrada',
        monthlyDebtExtraMinor: 'a verba mensal adicional para negociar dívidas',
        billsReviewed: 'confirmar se todas as contas e parcelas foram revisadas',
        debtsReviewed: 'confirmar se todas as dívidas e acordos foram revisados',
      };
      return {
        ...base,
        facts: [
          {
            id: 'onboarding',
            statement:
              'Vamos por uma informação de cada vez. Ainda não consigo dizer quanto está livre com segurança.',
          },
        ],
        missing: [labels[plan.missing[0] ?? ''] ?? plan.missing[0] ?? 'o plano'],
      };
    }
    if (purchase) {
      const result = assessPurchase(plan, purchaseSchema.parse(purchase));
      return {
        ...base,
        facts: [
          {
            id: 'purchase',
            statement:
              result.decision === 'fits'
                ? 'Cabe nos dados revisados de hoje.'
                : result.decision === 'wait'
                  ? 'Eu esperaria: essa compra passa da margem de hoje.'
                  : result.decision === 'not_recommended'
                    ? 'Não recomendo essa compra agora pelo impacto nas contas.'
                    : 'Ainda não dá para avaliar essa compra.',
          },
        ],
        calculated:
          'allowanceMinor' in result
            ? [
                {
                  id: 'available',
                  label: 'Margem disponível',
                  amountMinor: result.allowanceMinor,
                  currency: 'BRL',
                },
              ]
            : [],
        explanations: 'reason' in result && result.reason ? [result.reason] : [],
        missing: 'missing' in result ? result.missing : [],
      };
    }
    return {
      ...base,
      facts: [
        {
          id: 'status',
          statement:
            plan.status === 'deficit'
              ? 'O plano ainda não fecha. Vamos ajustar os compromissos antes de assumir uma compra nova.'
              : `Esta é sua margem até ${plan.nextIncomeOn}, com as verbas protegidas separadas.`,
        },
      ],
      calculated: [
        {
          id: 'free',
          label: 'Livre para compras extras',
          amountMinor: plan.freeMinor,
          currency: 'BRL',
        },
        {
          id: 'week',
          label: 'Limite de extras para os próximos sete dias (ou até a entrada)',
          amountMinor: plan.weeklyMinor,
          currency: 'BRL',
        },
        {
          id: 'leisure',
          label: 'Lazer previsto no plano',
          amountMinor: plan.plannedLeisureMinor,
          currency: 'BRL',
        },
        ...(plan.deficitMinor
          ? [
              {
                id: 'deficit',
                label: 'Falta até a próxima entrada',
                amountMinor: plan.deficitMinor,
                currency: 'BRL',
              },
            ]
          : []),
      ],
      explanations: [
        'A verba de lazer já foi separada da margem para outras compras. Dívidas e contas não são motivo para julgamento.',
        ...(plan.unknownRateDebtIds.length
          ? [
              'Há juros de dívidas ainda desconhecidos; não vou inventar qual acordo é mais vantajoso.',
            ]
          : []),
      ],
      proposedActions: [
        {
          id: 'next',
          kind: 'ask',
          label: 'Próximo passo: conferir a conta ou acordo com vencimento mais próximo.',
        },
      ],
    };
  }
}
