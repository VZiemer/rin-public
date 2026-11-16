import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import type { InteractionDispatcher } from '../../../application/ports/behavior-evolution.js';
import {
  interactionEventSchema,
  type InteractionEvent,
} from '../../../domain/model/behavior-evolution.js';

export class LambdaInteractionDispatcher implements InteractionDispatcher {
  constructor(
    private client: Pick<LambdaClient, 'send'>,
    private functionArn: string,
  ) {}
  async dispatch(input: InteractionEvent) {
    const event = interactionEventSchema.parse(input);
    const result = await this.client.send(
      new InvokeCommand({
        FunctionName: this.functionArn,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(event)),
      }),
      { abortSignal: AbortSignal.timeout(1500) },
    );
    if (result.StatusCode !== 202) throw new Error('Interaction was not accepted');
  }
}
