import type { RinTextGateway } from '../ports/text-gateway.js';
import { behaviorStyle } from '../behavior/style.js';
import type { BehaviorSnapshot } from '../../domain/model/assistant-behavior.js';
import { rinAddressStyle } from './user-address.js';
import { rinUnsolicitedSocialStyle } from './rin-conversation-style.js';

/** Shared Rin voice for notifications, without adding conversation tools or flirt rules. */
export function withRinTextStyle(
  gateway: RinTextGateway,
  resolve?: () => Promise<BehaviorSnapshot | null>,
): RinTextGateway {
  return {
    async complete(request) {
      const behavior = (await resolve?.()) ?? null;
      return gateway.complete({
        ...request,
        systemPrompt: `${request.systemPrompt}\n${behaviorStyle(behavior)}\n${rinAddressStyle}\n${rinUnsolicitedSocialStyle}`,
      });
    },
  };
}
