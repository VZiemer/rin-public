import type { ToolRisk, AgentToolCall } from '../../domain/model/contracts.js';
import type { ConfirmationRepository } from '../ports/confirmation.js';
import type { Clock, IdGenerator } from '../ports/runtime.js';
import type { ToolExecutionContext, AgentToolExecutor } from './tools.js';
import { AppError } from '../../domain/errors/app-error.js';
export class ConfirmationPolicy {
  constructor(private _autoApprovedWrites: ReadonlySet<string> = new Set()) {}
  requiresConfirmation(name: string, risk: ToolRisk) {
    void name;
    void risk;
    void this._autoApprovedWrites;
    // Confirmation UI is disabled. Tools execute directly when the agent explicitly selects them.
    return false;
  }
}
export class Confirmations {
  constructor(
    private repo: ConfirmationRepository,
    private clock: Clock,
    private ids: IdGenerator,
    private executor: AgentToolExecutor,
  ) {}
  async request(call: AgentToolCall, context: ToolExecutionContext) {
    const now = this.clock.now();
    const id = this.ids.next();
    await this.repo.create({
      ...context,
      id,
      toolCall: call,
      status: 'pending',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: Math.floor(now.getTime() / 1000) + 600,
    });
    return id;
  }
  async decide(userId: string, id: string, approve: boolean) {
    const record = await this.repo.get(userId, id);
    const now = Math.floor(this.clock.now().getTime() / 1000);
    if (!record) throw new AppError('confirmation_not_found', 404);
    if (record.expiresAt <= now || record.status !== 'pending')
      throw new AppError('confirmation_unavailable', 409);
    if (
      !(await this.repo.transition(userId, id, 'pending', approve ? 'executing' : 'rejected', now))
    )
      throw new AppError('confirmation_unavailable', 409);
    if (!approve) return { status: 'rejected' };
    try {
      const result = await this.executor.execute(record.toolCall, {
        userId,
        conversationId: record.conversationId,
      });
      const status = result.error ? 'failed' : 'approved';
      await this.repo.transition(userId, id, 'executing', status, now);
      return { status, result };
    } catch {
      await this.repo.transition(userId, id, 'executing', 'failed', now);
      throw new AppError('confirmation_execution_failed', 502);
    }
  }
}
