import { ConverseCommand, type BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { RinTextGateway, RinTextRequest } from '../../../application/ports/text-gateway.js';
import { extractUserFacingText } from '../../../application/agent/model-text.js';

/** Plain Converse call (no tools) used by the proactive/reminder cron flows. */
export class BedrockRinTextGateway implements RinTextGateway {
  constructor(
    private client: Pick<BedrockRuntimeClient, 'send'>,
    private modelId: string,
  ) {}

  async complete(request: RinTextRequest): Promise<string> {
    const result = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: request.systemPrompt }],
        messages: [{ role: 'user', content: [{ text: request.message }] }],
        inferenceConfig: {
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          ...(request.topP !== undefined ? { topP: request.topP } : {}),
        },
      }),
      { abortSignal: AbortSignal.timeout(8000) },
    );
    const raw = (result.output?.message?.content ?? [])
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
    return extractUserFacingText(raw);
  }
}
