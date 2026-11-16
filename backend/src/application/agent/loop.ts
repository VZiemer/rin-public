import { silentLogger, logFields, type Logger } from '../ports/logger.js';
import { ConfirmationPolicy, type Confirmations } from './confirmation.js';
import type { AgentModelGateway, ModelRequest, ToolResult } from '../ports/model.js';
import type { AgentToolRegistry, AgentToolExecutor, ToolExecutionContext } from './tools.js';
import { modelResponseSchema } from '../../domain/model/validation.js';
import { AppError } from '../../domain/errors/app-error.js';
export class AgentLoop {
  constructor(
    private model: AgentModelGateway,
    private registry: AgentToolRegistry,
    private executor: AgentToolExecutor,
    private maxIterations = 5,
    private policy = new ConfirmationPolicy(),
    private confirmations?: Confirmations,
    private log: Logger = silentLogger,
    private time: () => number = Date.now,
    private deadlineMs = 12_000,
  ) {
    if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 5)
      throw new Error('Invalid iteration limit');
    if (!Number.isInteger(deadlineMs) || deadlineMs < 1) throw new Error('Invalid agent deadline');
  }
  async run(
    request: Pick<ModelRequest, 'systemPrompt' | 'message'>,
    context: ToolExecutionContext,
  ) {
    const results: ToolResult[] = [];
    const started = this.time();
    for (let iteration = 0; iteration <= this.maxIterations; iteration++) {
      const remainingMs = this.deadlineMs - (this.time() - started);
      if (remainingMs <= 0) throw new AppError('agent_deadline_exceeded', 504);
      let result;
      const raw = await this.model.generate({
        ...request,
        tools: this.registry.definitions(),
        results,
        timeoutMs: remainingMs,
      });
      try {
        result = modelResponseSchema.parse(raw);
      } catch {
        throw new AppError('invalid_model_output', 502);
      }
      this.log.event('model_response_received', { iteration, result: result.type });
      if (result.type === 'final') return result.output;
      if (iteration === this.maxIterations) throw new AppError('max_tool_iterations', 422);
      const calls = result.type === 'tool_calls' ? result.calls : [result.call];
      for (const call of calls) {
        const { tool } = this.executor.validate(call);
        this.log.event(
          'tool_requested',
          logFields({ toolName: tool.name, toolRisk: tool.risk, toolInput: call.input, iteration }),
        );
        if (this.policy.requiresConfirmation(tool.name, tool.risk)) {
          if (!this.confirmations) throw new AppError('confirmation_required', 409);
          const id = await this.confirmations.request(call, context);
          this.log.event('confirmation_required', { toolName: tool.name, toolRisk: tool.risk });
          return {
            message: 'Confirme a ação para continuar.',
            avatarState: 'SCOLDING' as const,
            priority: 'NORMAL' as const,
            actions: [
              { type: 'CONFIRMATION' as const, label: tool.description, confirmationId: id },
            ],
          };
        }
        results.push(await this.executor.execute(call, context));
        this.log.event('tool_executed', { toolName: tool.name, iteration });
      }
    }
    throw new AppError('max_tool_iterations', 422);
  }
}
