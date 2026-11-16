import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/** Resolve AWSCURRENT without logging secrets; refresh warm Lambdas within a minute. */
export function openAiCredential(
  region: string,
  secretArn?: string,
  localApiKey?: string,
  client: Pick<SecretsManagerClient, 'send'> = new SecretsManagerClient({ region, maxAttempts: 1 }),
): () => Promise<string> {
  if (!secretArn && !localApiKey?.trim()) throw new Error('OpenAI credential is not configured');
  let cached: { key: string; expires: number } | undefined;
  return async () => {
    if (!secretArn) return localApiKey!.trim();
    if (cached && cached.expires > Date.now()) return cached.key;
    let key: string;
    try {
      const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }), {
        abortSignal: AbortSignal.timeout(5000),
      });
      const raw = result.SecretString?.trim();
      if (!raw) throw new Error('empty');
      if (raw.startsWith('{')) {
        const data = JSON.parse(raw) as unknown;
        const value =
          data !== null && typeof data === 'object' && 'apiKey' in data ? data.apiKey : undefined;
        if (typeof value !== 'string') throw new Error('invalid');
        key = value.trim();
      } else key = raw;
      if (!key || /\s/.test(key)) throw new Error('invalid');
    } catch {
      throw new Error('OpenAI credential unavailable');
    }
    cached = { key, expires: Date.now() + 60_000 };
    return key;
  };
}
