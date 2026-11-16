import { z } from 'zod';
import type { FinancialPlanning } from '../../../application/finance/planning.js';
import type { Statements } from '../../../application/finance/statements.js';
import { AppError } from '../../../domain/errors/app-error.js';
export async function financeRoute(
  input: { method: string; path: string; userId: string; assistantId: string; body?: unknown },
  planning: FinancialPlanning,
  statements?: Statements,
) {
  const { method, path, userId, assistantId, body } = input;
  if (path === 'plan' && method === 'GET') {
    const record = await planning.repo.getPlan(userId, assistantId);
    return {
      inputs: record?.values ?? {},
      revision: record?.revision ?? null,
      calculation: await planning.summary(userId, assistantId),
    };
  }
  if (path === 'history' && method === 'GET') return planning.observed(userId, assistantId);
  if (path === 'plan' && method === 'PATCH') return planning.update(userId, assistantId, body);
  if (path === 'debts' && method === 'GET') return planning.repo.listDebts(userId, assistantId);
  if (path === 'debts' && method === 'PUT') return planning.saveDebt(userId, assistantId, body);
  if (path === 'purchase' && method === 'POST') return planning.purchase(userId, assistantId, body);
  const paid = path.match(/^bills\/([A-Za-z0-9_-]{1,128})\/paid$/);
  if (paid && method === 'POST') {
    const command = z
      .object({ occurredOn: z.iso.date(), confirmed: z.literal(true) })
      .strict()
      .parse(body);
    return planning.reportBillPaid(userId, assistantId, paid[1]!, command.occurredOn);
  }
  if (path === 'statements' && method === 'POST') {
    if (!statements) throw new AppError('statement_upload_unavailable', 503);
    return statements.create(userId, assistantId, body);
  }
  const match = path.match(/^statements\/([\w-]+)(\/commit)?$/);
  if (match) {
    if (!statements) throw new AppError('statement_upload_unavailable', 503);
    const id = z.string().uuid().parse(match[1]);
    if (method === 'GET' && !match[2]) return statements.get(userId, assistantId, id);
    if (method === 'POST' && match[2]) return statements.commit(userId, assistantId, id, body);
  }
  throw new AppError('finance_route_not_found', 404);
}
