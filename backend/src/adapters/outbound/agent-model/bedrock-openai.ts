import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { AppError } from '../../../domain/errors/app-error.js';
import { ResponsesAgentModelGateway } from './openai.js';
import {
  readResponsesOutput,
  withinDeadline,
  type OpenAiFetch,
  type ResponsesTransport,
} from './openai-transport.js';

export type BedrockOpenAiCredentials = BedrockRuntimeClient['config']['credentials'];

/** AWS-hosted Responses API. No OpenAI or Bedrock API key is used. */
export class BedrockOpenAiResponsesTransport implements ResponsesTransport {
  private signer: SignatureV4;
  private hostname: string;

  constructor(
    credentials: BedrockOpenAiCredentials,
    region: string,
    private modelId = 'us.openai.gpt-6.1-sol',
    private fetcher: OpenAiFetch = fetch,
    private timeoutMs = 18_000,
  ) {
    if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/.test(region))
      throw new AppError('model_unavailable', 502);
    this.hostname = `bedrock-runtime.${region}.amazonaws.com`;
    this.signer = new SignatureV4({
      credentials: async () => {
        const identity = await credentials();
        if (!identity.accessKeyId?.trim() || !identity.secretAccessKey?.trim())
          throw new Error('AWS credentials unavailable');
        return identity;
      },
      region,
      service: 'bedrock',
      sha256: Sha256,
    });
  }

  async create(
    payload: Record<string, unknown>,
    timeoutMs = this.timeoutMs,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    let signal: AbortSignal;
    try {
      const budget = Math.min(this.timeoutMs, timeoutMs, 18_000);
      if (!Number.isFinite(budget) || budget < 1) throw new Error('expired deadline');
      signal = AbortSignal.timeout(Math.floor(budget));
      const body = JSON.stringify({
        ...payload,
        model: this.modelId,
        store: false,
        reasoning: { effort: 'low' },
      });
      const signed = await withinDeadline(
        () =>
          this.signer.sign({
            protocol: 'https:',
            hostname: this.hostname,
            method: 'POST',
            path: '/openai/v1/responses',
            headers: { host: this.hostname, 'content-type': 'application/json' },
            body,
          }),
        signal,
      );
      response = await withinDeadline(
        () =>
          this.fetcher(`https://${this.hostname}/openai/v1/responses`, {
            method: 'POST',
            headers: signed.headers,
            body,
            signal,
            // Never send AWS authorization/session headers to a redirect target.
            redirect: 'error',
          }),
        signal,
      );
    } catch {
      throw new AppError('model_unavailable', 502);
    }
    return readResponsesOutput(response, signal);
  }
}

export class BedrockOpenAiAgentModelGateway extends ResponsesAgentModelGateway {
  constructor(
    credentials: BedrockOpenAiCredentials,
    region: string,
    modelId = 'us.openai.gpt-6.1-sol',
    fetcher: OpenAiFetch = fetch,
    timeoutMs = 18_000,
  ) {
    super(
      new BedrockOpenAiResponsesTransport(credentials, region, modelId, fetcher, timeoutMs),
      Math.min(timeoutMs, 18_000),
    );
  }
}
