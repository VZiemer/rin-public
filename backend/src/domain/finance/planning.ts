import { z } from 'zod';
import type { FinanceBill } from './model.js';

export const minor = z.number().int().min(0).max(1_000_000_000_000);
const date = z.iso.date();
const forecastSchema = z
  .object({
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    incomeMinor: minor,
    essentialsMinor: minor,
    billsMinor: minor,
    debtMinor: minor,
    leisureMinor: minor,
    reserveMinor: minor,
    extraDebtMinor: minor,
  })
  .strict();
export const planFieldsSchema = z
  .object({
    currency: z.literal('BRL'),
    asOfOn: date,
    nextIncomeOn: date,
    cashMinor: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000),
    monthlyIncomeMinor: minor,
    incomeCertain: z.boolean(),
    essentialsUntilIncomeMinor: minor,
    monthlyEssentialsMinor: minor,
    leisureUntilIncomeMinor: minor,
    monthlyLeisureMinor: minor,
    bufferMinor: minor,
    monthlyReserveMinor: minor,
    debtExtraUntilIncomeMinor: minor,
    monthlyDebtExtraMinor: minor,
    billsReviewed: z.boolean(),
    debtsReviewed: z.boolean(),
    spendingBuckets: z
      .record(z.string().min(1).max(80), z.enum(['essential', 'leisure', 'extra']))
      .optional(),
    forecast: z
      .array(forecastSchema)
      .max(60)
      .refine((rows) => new Set(rows.map((r) => r.period)).size === rows.length)
      .optional(),
  })
  .strict();
export const planPatchSchema = planFieldsSchema.partial().strict();
export const debtSchema = z
  .object({
    id: z.string().regex(/^[\w-]{1,80}$/),
    creditor: z.string().trim().min(1).max(120),
    balanceMinor: minor,
    monthlyInterestBps: z.number().int().min(0).max(100000).nullable(),
    monthlyPaymentMinor: minor.nullable(),
    nextPaymentOn: date.nullable(),
    overdue: z.boolean(),
    essentialRisk: z.boolean(),
    status: z.enum(['active', 'settled']),
    billId: z.string().min(1).max(128).optional(),
  })
  .strict();
export type PlanFields = z.infer<typeof planFieldsSchema>;
export type PlanPatch = z.infer<typeof planPatchSchema>;
export type Debt = z.infer<typeof debtSchema>;
export const planRecordSchema = z.object({
  userId: z.string().min(1),
  assistantId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  values: planPatchSchema,
  balanceCapturedAt: z.iso.datetime().optional(),
  captureEntryIds: z.array(z.string()).max(1000).optional(),
});
export type PlanRecord = z.infer<typeof planRecordSchema>;
export const purchaseSchema = z
  .object({
    amountMinor: minor.refine((n) => n > 0),
    currency: z.literal('BRL'),
    purpose: z.enum(['general', 'leisure']).default('general'),
    installments: z.number().int().min(1).max(60).default(1),
    firstDueOn: date.optional(),
  })
  .strict();
export type Purchase = z.infer<typeof purchaseSchema>;

export function calculatePlan(
  values: PlanPatch,
  debts: Debt[],
  bills: FinanceBill[],
  today: string,
) {
  const parsed = planFieldsSchema.safeParse(values);
  const missing = parsed.success
    ? []
    : [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
  if (!parsed.success) return { status: 'needs_input' as const, missing };
  const p = parsed.data;
  if (p.asOfOn !== today) missing.push('an updated balance for today');
  if (p.nextIncomeOn <= today) missing.push('a future date for the next income');
  if (!p.incomeCertain) missing.push('confirmed income before committing to installments');
  if (!p.billsReviewed) missing.push('a review of outstanding bills and installments');
  if (!p.debtsReviewed) missing.push('a review of debts and agreements');
  const active = debts.filter((d) => d.status === 'active' && d.balanceMinor > 0);
  if (active.some((d) => (d.monthlyPaymentMinor ?? 0) > 0 && !d.nextPaymentOn))
    missing.push('agreement due dates');
  // An unknown agreement amount cannot be assumed to be zero.
  if (active.some((d) => d.monthlyPaymentMinor === null))
    missing.push('the monthly amount of each agreement (zero if there is no agreement yet)');
  if (
    active.some(
      (d) =>
        (d.monthlyPaymentMinor ?? 0) > 0 &&
        bills.some(
          (b) =>
            b.id === d.billId &&
            b.status === 'paid' &&
            b.dueOn === d.nextPaymentOn &&
            b.dueOn.slice(0, 7) < today.slice(0, 7),
        ),
    )
  )
    missing.push('the next due date for agreements whose latest installment was already paid');
  const open = bills.filter((b) => b.status === 'open');
  if (
    bills.some(
      (b) =>
        b.status !== 'cancelled' &&
        b.currency !== 'BRL' &&
        (b.status === 'open' || b.dueOn.slice(0, 7) === today.slice(0, 7)),
    )
  )
    missing.push('separate handling of bills in another currency');
  if (missing.length) return { status: 'needs_input' as const, missing };
  const due = open.filter((b) => b.dueOn <= p.nextIncomeOn);
  const coveredDebtIds = new Set(
    active
      .filter((d) =>
        bills.some(
          (b) => b.id === d.billId && b.status !== 'cancelled' && b.dueOn === d.nextPaymentOn,
        ),
      )
      .map((d) => d.id),
  );
  const debtDue = active.filter(
    (d) => d.nextPaymentOn && d.nextPaymentOn <= p.nextIncomeOn && !coveredDebtIds.has(d.id),
  );
  const billsMinor = due.reduce((n, b) => n + b.amountMinor, 0);
  const debtPaymentsMinor = debtDue.reduce((n, d) => n + (d.monthlyPaymentMinor ?? 0), 0);
  const protectedMinor =
    p.essentialsUntilIncomeMinor +
    p.leisureUntilIncomeMinor +
    p.bufferMinor +
    p.debtExtraUntilIncomeMinor;
  const netFreeMinor = p.cashMinor - billsMinor - debtPaymentsMinor - protectedMinor;
  const days = Math.max(1, Math.ceil((Date.parse(p.nextIncomeOn) - Date.parse(today)) / 86400000));
  // Bills are conservatively included in the monthly envelope; callers must not also
  // put the same bill in monthlyEssentialsMinor. Linked debt bills are counted once.
  const monthlyBillsMinor = bills
    .filter(
      (b) =>
        b.status !== 'cancelled' &&
        (b.status === 'open' || b.dueOn.slice(0, 7) === today.slice(0, 7)),
    )
    .reduce((n, b) => n + b.amountMinor, 0);
  const monthlyDebtMinor = active
    .filter((d) => !coveredDebtIds.has(d.id))
    .reduce((n, d) => n + (d.monthlyPaymentMinor ?? 0), 0);
  const monthlyFreeMinor =
    p.monthlyIncomeMinor -
    p.monthlyEssentialsMinor -
    monthlyBillsMinor -
    monthlyDebtMinor -
    p.monthlyLeisureMinor -
    p.monthlyReserveMinor -
    p.monthlyDebtExtraMinor;
  const debtBalanceMinor = active.reduce((n, d) => n + d.balanceMinor, 0);
  if (
    ![
      billsMinor,
      debtPaymentsMinor,
      protectedMinor,
      netFreeMinor,
      monthlyBillsMinor,
      monthlyDebtMinor,
      monthlyFreeMinor,
      debtBalanceMinor,
    ].every(Number.isSafeInteger)
  )
    return {
      status: 'needs_input' as const,
      missing: ['aggregate amounts within the calculation limit in cents'],
    };
  const knownRates = active
    .filter((d) => d.monthlyInterestBps !== null)
    .sort(
      (a, b) =>
        Number(b.essentialRisk) - Number(a.essentialRisk) ||
        b.monthlyInterestBps! - a.monthlyInterestBps! ||
        a.id.localeCompare(b.id),
    );
  return {
    status: netFreeMinor < 0 || monthlyFreeMinor < 0 ? ('deficit' as const) : ('ready' as const),
    currency: 'BRL' as const,
    asOfOn: today,
    nextIncomeOn: p.nextIncomeOn,
    netFreeMinor,
    freeMinor: Math.max(0, netFreeMinor),
    deficitMinor: Math.max(0, -netFreeMinor),
    weeklyMinor: Math.floor((Math.max(0, netFreeMinor) * Math.min(7, days)) / days),
    leisureMinor: netFreeMinor >= 0 ? p.leisureUntilIncomeMinor : 0,
    plannedLeisureMinor: p.leisureUntilIncomeMinor,
    billsMinor,
    debtPaymentsMinor,
    monthlyFreeMinor,
    monthlyLeisureMinor: p.monthlyLeisureMinor,
    debtOrder: knownRates.map((d) => d.id),
    unknownRateDebtIds: active.filter((d) => d.monthlyInterestBps === null).map((d) => d.id),
    debtBalanceMinor,
    forecast: p.forecast ?? [],
    warnings: [
      'Based on the reviewed balance and commitments; the balance and past expenses are not added again.',
      'Reported essential expenses must exclude recorded bills and installments. Include all future installments in the review.',
      'The leisure allowance is a plan, not a guaranteed surplus; a deficit requires adjusting the plan.',
      ...(active.some((d) => d.essentialRisk)
        ? ['A debt puts an essential need at risk: review negotiation priorities.']
        : []),
      ...(days > 45 ? ['The next income is more than 45 days away; review this date.'] : []),
    ],
  };
}
export type FinancialPlan = ReturnType<typeof calculatePlan>;
export function assessPurchase(plan: FinancialPlan, input: Purchase) {
  if (plan.status === 'needs_input')
    return { decision: 'needs_input' as const, missing: plan.missing };
  if (input.currency !== plan.currency)
    return { decision: 'needs_input' as const, missing: ['a currency compatible with the plan'] };
  const allowance = plan.freeMinor + (input.purpose === 'leisure' ? plan.leisureMinor : 0);
  if (plan.status === 'deficit')
    return {
      decision: 'not_recommended' as const,
      reason: 'The plan already has a deficit; this purchase would put more pressure on your bills.',
      allowanceMinor: allowance,
    };
  if (input.installments === 1)
    return {
      decision: input.amountMinor <= allowance ? ('fits' as const) : ('wait' as const),
      reason:
        input.amountMinor <= allowance
          ? 'It fits the reported allowance today while preserving protected funds.'
          : 'The amount exceeds the allowance available today. Do not count credit limits as income.',
      allowanceMinor: allowance,
      remainingMinor: allowance - input.amountMinor,
    };
  if (!input.firstDueOn)
    return {
      decision: 'needs_input' as const,
      missing: ['the first installment date and total amount including interest'],
    };
  if (input.firstDueOn < plan.asOfOn)
    return {
      decision: 'needs_input' as const,
      missing: ['today or a future date for the first installment'],
    };
  const largestInstallmentMinor = Math.ceil(input.amountMinor / input.installments);
  if (
    largestInstallmentMinor >
      plan.monthlyFreeMinor + (input.purpose === 'leisure' ? plan.monthlyLeisureMinor : 0) ||
    (input.firstDueOn <= plan.nextIncomeOn && largestInstallmentMinor > allowance)
  )
    return {
      decision: 'not_recommended' as const,
      reason: 'The installment compromises the safety buffer in the plan.',
      largestInstallmentMinor,
      allowanceMinor: allowance,
    };
  const first = new Date(`${input.firstDueOn.slice(0, 7)}-01T12:00:00Z`);
  const missing: string[] = [];
  for (let index = 0; index < input.installments; index++) {
    const month = new Date(first);
    month.setUTCMonth(first.getUTCMonth() + index);
    const period = month.toISOString().slice(0, 7);
    const row = plan.forecast.find((r) => r.period === period);
    if (!row) {
      missing.push(period);
      continue;
    }
    const free =
      row.incomeMinor -
      row.essentialsMinor -
      row.billsMinor -
      row.debtMinor -
      row.leisureMinor -
      row.reserveMinor -
      row.extraDebtMinor;
    if (largestInstallmentMinor > free + (input.purpose === 'leisure' ? row.leisureMinor : 0))
      return {
        decision: 'not_recommended' as const,
        reason: `The installment does not fit the projection for ${period}.`,
        largestInstallmentMinor,
        allowanceMinor: allowance,
      };
  }
  if (missing.length)
    return {
      decision: 'needs_input' as const,
      missing: missing.map((m) => `projected commitments for ${m}`),
      largestInstallmentMinor,
      reason: 'The first installment does not prove that the purchase will be affordable in future months.',
    };
  return {
    decision: 'fits' as const,
    reason:
      'The installments fit the supplied projections while preserving essentials, leisure and reserves; this depends on keeping the data up to date.',
    largestInstallmentMinor,
    allowanceMinor: allowance,
  };
}
