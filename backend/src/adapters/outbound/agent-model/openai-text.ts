import type { RinTextGateway, RinTextRequest } from '../../../application/ports/text-gateway.js';
import { extractUserFacingText } from '../../../application/agent/model-text.js';
import { AppError } from '../../../domain/errors/app-error.js';
import {
  asRecord,
  openAiMessageText,
  OpenAiResponsesTransport,
  type OpenAiApiKey,
  type OpenAiFetch,
} from './openai-transport.js';

/** Plain text for memory/proactive flows; no operational tools are supplied. */
export class OpenAiRinTextGateway implements RinTextGateway {
  private transport: OpenAiResponsesTransport;

  constructor(
    apiKey: OpenAiApiKey,
    modelId = 'gpt-6.1-sol',
    fetcher: OpenAiFetch = fetch,
    timeoutMs = 12_000,
  ) {
    this.transport = new OpenAiResponsesTransport(apiKey, modelId, fetcher, timeoutMs);
  }

  async complete(request: RinTextRequest): Promise<string> {
    const result = await this.transport.create({
      instructions: request.systemPrompt,
      input: [{ role: 'user', content: request.message }],
      // Reasoning consumes this budget too. Sampling parameters are unsupported
      // with gpt-6.1-sol reasoning and are deliberately omitted.
      max_output_tokens: Math.max(4096, request.maxTokens),
    });
    const output = result.output as unknown[];
    if (output.some((item) => asRecord(item)?.type === 'function_call'))
      throw new AppError('invalid_model_output', 502);
    const text = extractUserFacingText(openAiMessageText(output));
    if (!text) throw new AppError('invalid_model_output', 502);
    return text;
  }
}
