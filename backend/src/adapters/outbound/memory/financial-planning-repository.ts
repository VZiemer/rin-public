import type { FinancialPlanningRepository } from '../../../application/ports/financial-planning.js';
import type { Debt, PlanRecord } from '../../../domain/finance/planning.js';
import type { StatementJob } from '../../../domain/finance/statement.js';
export class InMemoryFinancialPlanningRepository implements FinancialPlanningRepository {
  private plans = new Map<string, PlanRecord>();
  private debts = new Map<string, Debt>();
  private statements = new Map<string, StatementJob>();
  private key(...parts: string[]) {
    return JSON.stringify(parts);
  }
  async getPlan(user: string, assistant: string) {
    return structuredClone(this.plans.get(this.key(user, assistant)) ?? null);
  }
  async savePlan(record: PlanRecord, expected: number | null) {
    const key = this.key(record.userId, record.assistantId);
    if ((this.plans.get(key)?.revision ?? null) !== expected) return false;
    this.plans.set(key, structuredClone(record));
    return true;
  }
  async listDebts(user: string, assistant: string) {
    return [...this.debts]
      .filter(([key]) => {
        const [u, a] = JSON.parse(key) as string[];
        return u === user && a === assistant;
      })
      .map(([, debt]) => structuredClone(debt));
  }
  async saveDebt(user: string, assistant: string, debt: Debt) {
    this.debts.set(this.key(user, assistant, debt.id), structuredClone(debt));
  }
  async getStatement(user: string, assistant: string, id: string) {
    return structuredClone(this.statements.get(this.key(user, assistant, id)) ?? null);
  }
  async saveStatement(job: StatementJob, expected: number | null) {
    const key = this.key(job.userId, job.assistantId, job.id);
    if ((this.statements.get(key)?.revision ?? null) !== expected) return false;
    this.statements.set(key, structuredClone(job));
    return true;
  }
}
