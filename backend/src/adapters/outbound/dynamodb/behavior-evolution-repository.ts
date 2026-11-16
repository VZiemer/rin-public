import { createHash } from 'node:crypto';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { BehaviorEvolutionRepository } from '../../../application/ports/behavior-evolution.js';
import type {
  InteractionAssessment,
  InteractionEvent,
  EvolutionDecision,
} from '../../../domain/model/behavior-evolution.js';
import { assistantBehaviorSchema } from '../../../domain/model/assistant-behavior.js';
import type { DocumentClient } from './store.js';

export class DynamoDbBehaviorEvolutionRepository implements BehaviorEvolutionRepository {
  constructor(
    private client: DocumentClient,
    private table: string,
  ) {}
  fingerprint(message: string) {
    return createHash('sha256')
      .update(message.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '))
      .digest('hex');
  }
  private keys(event: InteractionEvent, day: string, fingerprint: string) {
    return {
      PK: `USER#${event.userId}`,
      event: `BEHAVIOR_EVENT#${event.assistantId}#${event.eventId}`,
      dedup: `BEHAVIOR_DEDUP#${event.assistantId}#${day}#${fingerprint}`,
    };
  }
  async seen(event: InteractionEvent, day: string, fingerprint: string) {
    const key = this.keys(event, day, fingerprint);
    const results = await Promise.all(
      [key.event, key.dedup].map((SK) =>
        this.client.send(
          new GetCommand({
            TableName: this.table,
            Key: { PK: key.PK, SK },
            ConsistentRead: true,
            ProjectionExpression: 'PK',
          }),
        ),
      ),
    );
    return results.some((result) => !!result.Item);
  }
  async commit(
    event: InteractionEvent,
    day: string,
    fingerprint: string,
    assessment: InteractionAssessment,
    decision: EvolutionDecision,
    expectedVersion: number | null,
    now: Date,
  ): Promise<'committed' | 'duplicate' | 'conflict'> {
    const key = this.keys(event, day, fingerprint);
    const receipt = {
      eventId: event.eventId,
      assistantId: event.assistantId,
      fingerprint,
      day,
      decision: decision.reason,
      moodDelta: decision.moodDelta,
      intimacyDelta: decision.intimacyDelta,
      createdAt: now.toISOString(),
      occurredAt: event.occurredAt,
      assessment,
      expiresAt: Math.floor(now.getTime() / 1000) + 90 * 86400,
    };
    const writes = [
      key.event,
      key.dedup,
      `BEHAVIOR_AUDIT#${event.assistantId}#${now.toISOString()}#${event.eventId}`,
    ].map((SK) => ({
      Put: {
        TableName: this.table,
        Item: {
          ...receipt,
          PK: key.PK,
          SK,
          entityType: 'BEHAVIOR_EVOLUTION',
          source: 'conversation',
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    }));
    const state = decision.state ? assistantBehaviorSchema.parse(decision.state) : null;
    if (
      state &&
      (state.version !== (expectedVersion ?? 0) + 1 ||
        state.userId !== event.userId ||
        state.assistantId !== event.assistantId)
    )
      throw new Error('Invalid scoped evolution state');
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            ...(state
              ? [
                  {
                    Put: {
                      TableName: this.table,
                      Item: {
                        ...state,
                        PK: key.PK,
                        SK: `ASSISTANT_BEHAVIOR#${event.assistantId}`,
                        entityType: 'ASSISTANT_BEHAVIOR',
                      },
                      ConditionExpression:
                        expectedVersion === null
                          ? 'attribute_not_exists(PK)'
                          : '#version = :expected',
                      ...(expectedVersion === null
                        ? {}
                        : {
                            ExpressionAttributeNames: { '#version': 'version' },
                            ExpressionAttributeValues: { ':expected': expectedVersion },
                          }),
                    },
                  },
                ]
              : []),
            ...writes,
          ],
        }),
      );
      return 'committed';
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'TransactionCanceledException') throw error;
      if (await this.seen(event, day, fingerprint)) return 'duplicate';
      return 'conflict';
    }
  }
}
