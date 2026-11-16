import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { loadConfig } from './config.js';
import {
  DynamoDbAssistantBehaviorRepository,
  DynamoDbPersonalityRepository,
} from '../adapters/outbound/dynamodb/assistant-behavior-repository.js';
import { DynamoDbBehaviorEvolutionRepository } from '../adapters/outbound/dynamodb/behavior-evolution-repository.js';
import { BedrockInteractionClassifier } from '../adapters/outbound/agent-model/interaction-classifier.js';
import { BehaviorRuntime } from '../application/behavior/runtime.js';
import { ProcessBehaviorInteraction } from '../application/behavior/process-interaction.js';
import { DynamoDbAssistantRepository } from '../adapters/outbound/dynamodb/assistant-repository.js';

let processor: ProcessBehaviorInteraction | undefined;
export async function handler(input: unknown) {
  const config = loadConfig();
  if (!config.behaviorFeedbackEnabled) return { status: 'ignored', reason: 'disabled' };
  processor ??= (() => {
    const client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: config.region, maxAttempts: 2 }),
      { marshallOptions: { removeUndefinedValues: true } },
    );
    return new ProcessBehaviorInteraction(
      new BehaviorRuntime(
        new DynamoDbAssistantBehaviorRepository(client, config.tableName),
        new DynamoDbPersonalityRepository(client, config.tableName),
        new DynamoDbAssistantRepository(client, config.tableName),
      ),
      new DynamoDbBehaviorEvolutionRepository(client, config.tableName),
      new BedrockInteractionClassifier(
        new BedrockRuntimeClient({ region: config.region, maxAttempts: 1 }),
        config.bedrockModelId,
      ),
      { now: () => new Date() },
    );
  })();
  try {
    const result = await processor.execute(input);
    // Never log the invocation event, prompt, user text or raw provider output.
    console.info(JSON.stringify({ event: 'behavior_feedback_result', ...result }));
    return result;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'behavior_feedback_failed',
        errorName: error instanceof Error ? error.name : 'unknown',
      }),
    );
    // eslint-disable-next-line preserve-caught-error -- Lambda logs causes; provider errors may embed private user text.
    throw new Error('Behavior feedback failed');
  }
}
