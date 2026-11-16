import type { AgentOutput, AgentToolCall, ToolRisk } from '../../domain/model/contracts.js';
export interface ToolDefinition {
  name: string;
  description: string;
  risk: ToolRisk;
  inputSchema: Record<string, unknown>;
}
export interface ToolResult {
  input?: unknown;
  callId: string;
  name: string;
  output: unknown;
  error?: string;
}
export interface ModelRequest {
  systemPrompt: string;
  message: string;
  tools: ToolDefinition[];
  results: ToolResult[];
  /** Remaining request budget; adapters should bound provider calls to this duration. */
  timeoutMs?: number;
}
export type ModelResponse =
  | { type: 'final'; output: AgentOutput }
  | { type: 'tool_call'; call: AgentToolCall }
  | { type: 'tool_calls'; calls: AgentToolCall[] };
export interface AgentModelGateway {
  generate(request: ModelRequest): Promise<ModelResponse>;
}
