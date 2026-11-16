import { AppError } from '../../../domain/errors/app-error.js';

export type OpenAiFetch = typeof fetch;
export type OpenAiApiKey = () => Promise<string>;
export interface ResponsesTransport {
  create(payload: Record<string, unknown>, timeoutMs?: number): Promise<Record<string, unknown>>;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Bound every asynchronous stage, including credential loading and body reads. */
export async function withinDeadline<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw new Error('expired model deadline');
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error('expired model deadline'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/** No provider response body, headers, credentials or network error is exposed. */
export class OpenAiResponsesTransport implements ResponsesTransport {
  constructor(
    private apiKey: OpenAiApiKey,
    private modelId = 'gpt-6.1-sol',
    private fetcher: OpenAiFetch = fetch,
    private timeoutMs = 12_000,
  ) {}

  async create(
    payload: Record<string, unknown>,
    timeoutMs = this.timeoutMs,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    let signal: AbortSignal;
    try {
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error('expired deadline');
      signal = AbortSignal.timeout(Math.floor(timeoutMs));
      const key = (await withinDeadline(() => this.apiKey(), signal)).trim();
      if (!key || signal.aborted) throw new Error('credential unavailable or deadline expired');
      response = await withinDeadline(
        () =>
          this.fetcher('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              model: this.modelId,
              store: false,
              reasoning: { effort: 'low' },
            }),
            signal,
          }),
        signal,
      );
    } catch {
      throw new AppError('model_unavailable', 502);
    }
    return readResponsesOutput(response, signal);
  }
}

export async function readResponsesOutput(
  response: Response,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  if (!response.ok) {
    // Discard error bodies, which can echo request content and credentials.
    void response.body?.cancel().catch(() => undefined);
    throw new AppError('model_unavailable', 502);
  }
  let parsed: unknown;
  try {
    parsed = (await withinDeadline(() => response.json() as Promise<unknown>, signal)) as unknown;
  } catch {
    if (signal.aborted) throw new AppError('model_unavailable', 502);
    throw new AppError('invalid_model_output', 502);
  }
  const result = asRecord(parsed);
  if (result?.status === 'failed' || result?.error) throw new AppError('model_unavailable', 502);
  if (!result || result.status !== 'completed' || !Array.isArray(result.output))
    throw new AppError('invalid_model_output', 502);
  return result;
}

/** Read only message output: reasoning items and summaries are never user text. */
export function openAiMessageText(output: unknown[]): string {
  const parts: string[] = [];
  for (const item of output) {
    const message = asRecord(item);
    if (message?.type !== 'message') continue;
    if (message.status !== undefined && message.status !== 'completed')
      throw new AppError('invalid_model_output', 502);
    if (!Array.isArray(message.content)) throw new AppError('invalid_model_output', 502);
    for (const raw of message.content) {
      const content = asRecord(raw);
      if (content?.type === 'refusal') throw new AppError('invalid_model_output', 502);
      if (content?.type === 'output_text' && typeof content.text === 'string')
        parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}
