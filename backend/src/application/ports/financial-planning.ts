import type { Debt, PlanRecord } from '../../domain/finance/planning.js';
import type { StatementJob } from '../../domain/finance/statement.js';
export interface FinancialPlanningRepository {
  getPlan(userId: string, assistantId: string): Promise<PlanRecord | null>;
  savePlan(record: PlanRecord, expectedRevision: number | null): Promise<boolean>;
  listDebts(userId: string, assistantId: string): Promise<Debt[]>;
  saveDebt(userId: string, assistantId: string, debt: Debt): Promise<void>;
  getStatement(userId: string, assistantId: string, id: string): Promise<StatementJob | null>;
  saveStatement(job: StatementJob, expectedRevision: number | null): Promise<boolean>;
}
