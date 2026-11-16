import { z } from 'zod';
import type { AgentToolCall, ToolRisk } from '../../domain/model/contracts.js';
import type { Clock } from '../ports/runtime.js';
import type { ToolDefinition, ToolResult } from '../ports/model.js';
import { silentLogger, logFields, type Logger } from '../ports/logger.js';
import { AppError } from '../../domain/errors/app-error.js';
import type { LocalTimeContext } from './local-time.js';
export interface ToolExecutionContext {
  userId: string;
  conversationId: string;
  deviceId?: string | undefined;
  time?: LocalTimeContext | undefined;
}
export interface AgentTool {
  name: string;
  description: string;
  risk: ToolRisk;
  inputSchema: z.ZodType;
  execute(input: unknown, context: ToolExecutionContext): Promise<unknown>;
}
export function defineTool<T>(definition: {
  name: string;
  description: string;
  risk: ToolRisk;
  inputSchema: z.ZodType<T>;
  execute(input: T, context: ToolExecutionContext): Promise<unknown>;
}): AgentTool {
  return {
    ...definition,
    execute: (input, context) => definition.execute(definition.inputSchema.parse(input), context),
  };
}
export class AgentToolRegistry {
  private tools = new Map<string, AgentTool>();
  constructor(tools: AgentTool[]) {
    for (const tool of tools) {
      if (this.tools.has(tool.name)) throw new Error('Duplicate tool');
      this.tools.set(tool.name, tool);
    }
  }
  get(name: string) {
    const tool = this.tools.get(name);
    if (!tool) throw new AppError('unknown_tool');
    return tool;
  }
  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      risk: t.risk,
      inputSchema: z.toJSONSchema(t.inputSchema),
    }));
  }
}
export class AgentToolExecutor {
  constructor(
    private registry: AgentToolRegistry,
    private log: Logger = silentLogger,
  ) {}
  validate(call: AgentToolCall) {
    const tool = this.registry.get(call.name);
    try {
      return { tool, input: tool.inputSchema.parse(call.input) };
    } catch (error) {
      this.log.event(
        'tool_argument_validation_error',
        logFields({
          callId: call.id,
          name: call.name,
          rawInput: call.input,
          issues: error && typeof error === 'object' && 'issues' in error ? error.issues : undefined,
        }),
      );
      throw new AppError('invalid_tool_arguments', 422);
    }
  }
  async execute(call: AgentToolCall, context: ToolExecutionContext): Promise<ToolResult> {
    const { tool, input } = this.validate(call);
    this.log.event('tool_input', logFields({ callId: call.id, name: call.name, input }));
    try {
      const output = await tool.execute(input, context);
      this.log.event('tool_output', logFields({ callId: call.id, name: call.name, output }));
      return {
        callId: call.id,
        name: call.name,
        input,
        output,
      };
    } catch (error) {
      const errorCode =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : error instanceof Error && error.message
            ? error.message
            : 'tool_execution_failed';
      this.log.event(
        'tool_execution_error',
        logFields({
          callId: call.id,
          name: call.name,
          input,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorCode,
        }),
      );
      return {
        callId: call.id,
        name: call.name,
        input,
        output: null,
        error: errorCode,
      };
    }
  }
}
export const currentTimeTool = (clock: Clock) =>
  defineTool({
    name: 'get_current_time',
    description: 'Get the current UTC time.',
    risk: 'READ',
    inputSchema: z.object({}).strict(),
    execute: async () => ({ currentTime: clock.now().toISOString() }),
  });
