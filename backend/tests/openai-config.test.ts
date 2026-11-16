import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/bootstrap/config.js';

beforeEach(() => {
  vi.stubEnv('MODEL_PROVIDER', undefined);
  vi.stubEnv('AGENT_MODEL_PROVIDER', undefined);
  vi.stubEnv('AGENT_BEDROCK_MODEL_ID', undefined);
  vi.stubEnv('BEDROCK_OPENAI_MODEL_ID', undefined);
  vi.stubEnv('OPENAI_MODEL_ID', undefined);
  vi.stubEnv('OPENAI_SECRET_ARN', undefined);
  vi.stubEnv('OPENAI_API_KEY', undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('OpenAI agent configuration', () => {
  it('selects GPT-OSS only for chat while retaining the existing background model', () => {
    vi.stubEnv('MODEL_PROVIDER', 'bedrock');
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'bedrock');
    vi.stubEnv('AGENT_BEDROCK_MODEL_ID', 'openai.gpt-oss-120b-1:0');
    const config = loadConfig();
    expect(config.agentBedrockModelId).toBe('openai.gpt-oss-120b-1:0');
    expect(config.bedrockModelId).toBe('amazon.nova-lite-v1:0');
    expect(config.modelProvider).toBe('bedrock');
  });
  it('preserves the existing default provider and exact requested model identifier', () => {
    const config = loadConfig();
    expect(config.modelProvider).toBe('static');
    expect(config.agentModelProvider).toBeUndefined();
    expect(config.openAiModelId).toBe('gpt-6.1-sol');
    expect(config.openAiSecretArn).toBeUndefined();
    expect(config.openAiApiKey).toBeUndefined();
  });

  it('allows the agent to use OpenAI while background services retain Bedrock', () => {
    vi.stubEnv('MODEL_PROVIDER', 'bedrock');
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'openai');
    vi.stubEnv(
      'OPENAI_SECRET_ARN',
      'arn:aws:secretsmanager:us-east-1:123456789012:secret:rin-openai',
    );
    const config = loadConfig();
    expect(config.agentModelProvider).toBe('openai');
    expect(config.modelProvider).toBe('bedrock');
    expect(config.openAiModelId).toBe('gpt-6.1-sol');
    expect(config.openAiSecretArn).toBe(
      'arn:aws:secretsmanager:us-east-1:123456789012:secret:rin-openai',
    );
  });

  it('rejects unsupported agent providers rather than silently falling back', () => {
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'unknown-provider');
    expect(() => loadConfig()).toThrow();
  });

  it('uses the exact GPT model through AWS credentials without an OpenAI secret', () => {
    vi.stubEnv('MODEL_PROVIDER', 'bedrock');
    vi.stubEnv('AGENT_MODEL_PROVIDER', 'bedrock-openai');
    const config = loadConfig();
    expect(config.agentModelProvider).toBe('bedrock-openai');
    expect(config.bedrockOpenAiModelId).toBe('us.openai.gpt-6.1-sol');
    expect(config.bedrockModelId).toBe('amazon.nova-lite-v1:0');
    expect(config.openAiApiKey).toBeUndefined();
    expect(config.openAiSecretArn).toBeUndefined();
  });

  it('rejects an OpenAI secret setting that is not a Secrets Manager ARN', () => {
    vi.stubEnv('OPENAI_SECRET_ARN', 'rin-openai');
    expect(() => loadConfig()).toThrow();
  });
});
