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
          missing: ['an updated balance after importing, correcting or recording an entry with another date/currency'],
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
        'These are observed entries, not proof of complete coverage of all accounts or future income.',
        'Confirm net income, essential expenses, agreements and a leisure allowance before approving the plan.',
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
        currency: 'the plan currency (BRL)',
        asOfOn: 'the date of the reported balance',
        cashMinor: 'your available balance today, excluding credit limits',
        nextIncomeOn: 'the date of your next income',
        monthlyIncomeMinor: 'your monthly net income',
        incomeCertain: 'whether this income is confirmed',
        essentialsUntilIncomeMinor:
          'how much you still need for essentials until the next income, without counting recorded bills twice',
        monthlyEssentialsMinor: 'your monthly essential costs, without counting recorded bills twice',
        leisureUntilIncomeMinor: 'a realistic leisure allowance until the next income',
        monthlyLeisureMinor: 'the monthly leisure allowance you want to preserve',
        bufferMinor: 'a safety buffer in your balance',
        monthlyReserveMinor: 'your planned monthly reserve',
        debtExtraUntilIncomeMinor: 'the additional debt allowance until the next income',
        monthlyDebtExtraMinor: 'the additional monthly allowance for debt negotiations',
        billsReviewed: 'confirmation that all bills and installments have been reviewed',
        debtsReviewed: 'confirmation that all debts and agreements have been reviewed',
      };
      return {
        ...base,
        facts: [
          {
            id: 'onboarding',
            statement:
              'Let us take one piece of information at a time. I cannot reliably tell you how much is available yet.',
          },
        ],
        missing: [labels[plan.missing[0] ?? ''] ?? plan.missing[0] ?? 'the plan'],
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
                ? 'It fits the data reviewed today.'
                : result.decision === 'wait'
                  ? 'I would wait: this purchase exceeds the allowance available today.'
                  : result.decision === 'not_recommended'
                    ? 'I do not recommend this purchase now because of its impact on your bills.'
                    : 'There is not enough information to assess this purchase yet.',
          },
        ],
        calculated:
          'allowanceMinor' in result
            ? [
                {
                  id: 'available',
                  label: 'Available allowance',
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
              ? 'The plan does not balance yet. Let us adjust commitments before taking on a new purchase.'
              : `This is your allowance until ${plan.nextIncomeOn}, with protected funds set aside.`,
        },
      ],
      calculated: [
        {
          id: 'free',
          label: 'Available for extra purchases',
          amountMinor: plan.freeMinor,
          currency: 'BRL',
        },
        {
          id: 'week',
          label: 'Extra spending limit for the next seven days (or until income arrives)',
          amountMinor: plan.weeklyMinor,
          currency: 'BRL',
        },
        {
          id: 'leisure',
          label: 'Planned leisure allowance',
          amountMinor: plan.plannedLeisureMinor,
          currency: 'BRL',
        },
        ...(plan.deficitMinor
          ? [
              {
                id: 'deficit',
                label: 'Shortfall until the next income',
                amountMinor: plan.deficitMinor,
                currency: 'BRL',
              },
            ]
          : []),
      ],
      explanations: [
        'The leisure allowance is already separate from the budget for other purchases. Debts and bills are not grounds for judgment.',
        ...(plan.unknownRateDebtIds.length
          ? [
              'Some debt interest rates are unknown; I will not guess which agreement is better.',
            ]
          : []),
      ],
      proposedActions: [
        {
          id: 'next',
          kind: 'ask',
          label: 'Next step: check the bill or agreement with the nearest due date.',
        },
      ],
    };
  }
}
