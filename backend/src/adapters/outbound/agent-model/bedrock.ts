import {
  ConverseCommand,
  type BedrockRuntimeClient,
  type Message,
  type Tool,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  AgentModelGateway,
  ModelRequest,
  ModelResponse,
} from '../../../application/ports/model.js';
import { silentLogger, type Logger } from '../../../application/ports/logger.js';
import { agentOutputSchema, toolCallSchema } from '../../../domain/model/validation.js';
import type { AgentOutput } from '../../../domain/model/contracts.js';
import { AppError } from '../../../domain/errors/app-error.js';
function document(
  value: unknown,
): NonNullable<NonNullable<NonNullable<Tool['toolSpec']>['inputSchema']>['json']> {
  return JSON.parse(JSON.stringify(value)) as NonNullable<
    NonNullable<NonNullable<Tool['toolSpec']>['inputSchema']>['json']
  >;
}
// Nova accepts a subset at the schema root; retain strict validation locally.
function toolSchema(schema: Record<string, unknown>) {
  return document({
    type: schema.type,
    properties: schema.properties,
    required: schema.required ?? [],
  });
}
const respondSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    avatarState: {
      type: 'string',
      enum: [
        'NEUTRAL',
        'SCOLDING',
        'SMUG',
        'EMBARRASSED',
        'ANGRY_POUT',
        'SURPRISED',
        'SOFT_SMILE',
        'FOCUSED',
        'TIRED',
      ],
    },
    priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['LOCAL_TOOL'] },
          tool: {
            type: 'string',
            enum: ['focus.start', 'device.set_alarm', 'device.open_alarms'],
          },
          payload: { type: 'object' },
          requiresConfirmation: { type: 'boolean' },
        },
        required: ['type', 'tool', 'payload'],
      },
    },
  },
  required: ['message', 'avatarState', 'priority', 'actions'],
};
const bedrockSystemSuffix =
  "\nFor normal conversation, greetings and general questions, use respond directly and do not call operational tools. Call operational tools only when the user explicitly requests or clearly implies the corresponding action. Shopping-list requests without a date/time should use shopping tools rather than reminders; shopping requests with an explicit date/time should use add_shopping_items_with_reminder. A normal reminder does not require an exact time: if the user asks for a non-shopping reminder but gives no time/date, create an unscheduled reminder; if only a day is given, create a date-only reminder. Never invent a time the user did not provide. Completion statements such as 'completei a task X', 'ja fiz', 'terminei' or 'esta concluido' should use the appropriate completion/removal tool only when the referenced item is clear from the message or conversation context; otherwise ask which item. If an action request is unclear, use respond and ask the user to say clearly what they want; never request confirmation UI. Prefer batch-capable shopping tools for multiple products. Multiple independent tool calls are supported when genuinely necessary. Use respond for the final answer with message, avatarState, priority and actions. Once a successful tool result is available, use it. Do not repeat a successful tool call with the same arguments. If a tool result returns an error code such as schedule_must_be_future, explain the specific issue naturally and ask for a future time rather than saying only that the tool failed. If the results answer the user request, immediately call respond. Always include actions as an array; use [] when there are no actions. Never expose chain-of-thought, internal reasoning, <thinking> tags or tool-protocol markup to the user. Never emit <response> or <respond> markup as text and never prepend meta-commentary such as \"Responding to the user directly\". If you answer as plain text, output only the final user-facing answer. Never claim that a reminder will be delivered automatically: the scheduler is not enabled.";
function fallbackOutput(message: string): AgentOutput {
  return { message, avatarState: 'NEUTRAL', priority: 'NORMAL', actions: [] };
}
function unescapeQuoted(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
}
function outputFromQuotedMessage(source: string, messageRaw: string): AgentOutput | undefined {
  const message = unescapeQuoted(messageRaw).trim();
  if (!message) return undefined;
  const avatarMatch = source.match(/\bavatarState\s*=\s*"([^"]+)"/i);
  const priorityMatch = source.match(/\bpriority\s*=\s*"([^"]+)"/i);
  const candidate = {
    message,
    avatarState: avatarMatch?.[1] ?? 'NEUTRAL',
    priority: priorityMatch?.[1] ?? 'NORMAL',
    actions: [],
  };
  const parsed = agentOutputSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return fallbackOutput(candidate.message);
}
function normalizeStructuredOutput(value: unknown): AgentOutput | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const candidate = {
    ...record,
    avatarState: typeof record.avatarState === 'string' ? record.avatarState : 'NEUTRAL',
    priority: typeof record.priority === 'string' ? record.priority : 'NORMAL',
    actions: Array.isArray(record.actions) ? record.actions : [],
  };
  const parsed = agentOutputSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  if (typeof record.message === 'string' && record.message.trim())
    return fallbackOutput(record.message.trim());
  return undefined;
}
function tryJsonOutput(candidateText: string | undefined): AgentOutput | undefined {
  if (!candidateText) return undefined;
  const cleaned = candidateText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return normalizeStructuredOutput(JSON.parse(cleaned) as unknown);
  } catch {
    return undefined;
  }
}
export function parsePlainModelText(text: string): AgentOutput {
  const jsonCandidate = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return agentOutputSchema.parse(JSON.parse(jsonCandidate) as unknown);
  } catch {
    // continue to protocol/plain-text fallbacks
  }
  const withoutThinking = text.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '').trim();
  const responseBlock = withoutThinking.match(/<response\b[^>]*>([\s\S]*?)<\/response>/i);
  if (responseBlock) {
    const parsedResponse = tryJsonOutput(responseBlock[1]);
    if (parsedResponse) return parsedResponse;
    const responseText = responseBlock[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
    if (responseText) return fallbackOutput(responseText);
  }
  const respondTag = withoutThinking.match(/<respond\b([^>]*)>/i);
  if (respondTag) {
    const attrs = respondTag[1] ?? '';
    const messageMatch = attrs.match(/\bmessage\s*=\s*"((?:\\.|[^"\\])*)"/i);
    if (messageMatch?.[1]) {
      const parsed = outputFromQuotedMessage(attrs, messageMatch[1]);
      if (parsed) return parsed;
    }
  }
  const bareMessageMatch = withoutThinking.match(/\bmessage\s*=\s*"((?:\\.|[^"\\])*)"/i);
  if (bareMessageMatch?.[1]) {
    const parsed = outputFromQuotedMessage(withoutThinking, bareMessageMatch[1]);
    if (parsed) return parsed;
  }
  const firstBrace = withoutThinking.indexOf('{');
  const lastBrace = withoutThinking.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const embedded = tryJsonOutput(withoutThinking.slice(firstBrace, lastBrace + 1));
    if (embedded) return embedded;
  }
  const userFacingText = withoutThinking
    .replace(/<response\b[^>]*>[\s\S]*?<\/response>/gi, '')
    .replace(/<\/?respond\b[^>]*>/gi, '')
    .replace(/^Responding to the user[^.]*\.?\s*/i, '')
    .trim();
  if (!userFacingText) throw new AppError('invalid_model_output', 502);
  return fallbackOutput(userFacingText);
}
export class BedrockAgentModelGateway implements AgentModelGateway {
  constructor(
    private client: Pick<BedrockRuntimeClient, 'send'>,
    private modelId: string,
    private log: Logger = silentLogger,
  ) {}
  async generate(request: ModelRequest): Promise<ModelResponse> {
    const gptOss = /^openai\.gpt-oss-(?:120|20)b-1:0$/.test(this.modelId);
    const timeoutMs = Math.min(gptOss ? 18_000 : 5_000, request.timeoutMs ?? Infinity);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1)
      throw new AppError('agent_deadline_exceeded', 504);
    const messages: Message[] = [{ role: 'user', content: [{ text: request.message }] }];
    // Rebuild protocol pairs per request; no shared conversational state between users.
    for (const result of request.results) {
      messages.push(
        {
          role: 'assistant',
          content: [
            {
              toolUse: {
                toolUseId: result.callId,
                name: result.name,
                input: document(result.input ?? {}),
              },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              toolResult: {
                toolUseId: result.callId,
                status: result.error ? 'error' : 'success',
                content: [
                  { text: JSON.stringify(result.error ? { error: result.error } : result.output) },
                ],
              },
            },
          ],
        },
      );
    }
    // A successful parameterless read is stable for this short run. Keep its
    // result in history and remove it from choices to avoid redundant loops.
    const available = request.tools.filter(
      (t) =>
        !(
          t.risk === 'READ' &&
          Object.keys((t.inputSchema.properties ?? {}) as object).length === 0 &&
          request.results.some((result) => result.name === t.name && !result.error)
        ),
    );
    const tools: Tool[] = available.map((t) => ({
      toolSpec: {
        name: t.name,
        description: t.description,
        inputSchema: { json: toolSchema(t.inputSchema) },
      },
    }));
    tools.push({
      toolSpec: {
        name: 'respond',
        description:
          'Return the final structured answer to the user. This does not execute an external action.',
        inputSchema: { json: document(respondSchema) },
      },
    });
    let result;
    try {
      result = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [
            {
              text: request.systemPrompt + bedrockSystemSuffix,
            },
          ],
          messages,
          toolConfig: { tools, toolChoice: { auto: {} } },
          inferenceConfig: gptOss
            ? { maxTokens: 4096, temperature: 0.6 }
            : { maxTokens: 1500, temperature: 0.2 },
          ...(gptOss ? { additionalModelRequestFields: { reasoning_effort: 'low' } } : {}),
        }),
        { abortSignal: AbortSignal.timeout(Math.floor(timeoutMs)) },
      );
    } catch {
      throw new AppError('model_unavailable', 502);
    }
    if (
      gptOss &&
      [
        'max_tokens',
        'guardrail_intervened',
        'content_filtered',
        'model_context_window_exceeded',
      ].includes(result.stopReason ?? '')
    )
      throw new AppError('invalid_model_output', 502);
    const content = result.output?.message?.content ?? [];
    this.log.event('bedrock_output', {
      stopReason: result.stopReason ?? 'unknown',
      contentBlockCount: content.length,
      toolCallCount: content.filter((block) => block.toolUse).length,
    });
    const calls = content.flatMap((block) => (block.toolUse ? [block.toolUse] : []));
    const operationalCalls = calls.filter((call) => call.name !== 'respond');
    const respondCall = calls.find((call) => call.name === 'respond');
    if (operationalCalls.length) {
      const parsedCalls = operationalCalls.map((call) =>
        toolCallSchema.safeParse({
          id: call.toolUseId,
          name: call.name,
          input: call.input,
        }),
      );
      if (parsedCalls.some((parsed) => !parsed.success))
        throw new AppError('invalid_model_output', 502);
      const validCalls = parsedCalls.flatMap((parsed) => (parsed.success ? [parsed.data] : []));
      if (validCalls.length === 1) return { type: 'tool_call', call: validCalls[0]! };
      return { type: 'tool_calls', calls: validCalls };
    }
    if (respondCall) {
      const input = respondCall.input;
      const normalized =
        input && typeof input === 'object' && !Array.isArray(input) && !('actions' in input)
          ? { ...input, actions: [] }
          : input;
      const parsed = agentOutputSchema.safeParse(normalized);
      if (!parsed.success) {
        const message =
          input &&
          typeof input === 'object' &&
          !Array.isArray(input) &&
          typeof (input as { message?: unknown }).message === 'string'
            ? (input as { message: string }).message.trim()
            : '';
        if (message) return { type: 'final', output: fallbackOutput(message) };
        throw new AppError('invalid_model_output', 502);
      }
      return { type: 'final', output: parsed.data };
    }
    const text = content
      .map((block) => block.text ?? '')
      .join('')
      .trim();
    if (!text) throw new AppError('invalid_model_output', 502);
    return { type: 'final', output: parsePlainModelText(text) };
  }
}
