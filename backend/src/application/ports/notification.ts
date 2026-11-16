import type { AgentOutput } from '../../domain/model/contracts.js';
import type { AvatarImageCommand } from '../../domain/model/rin-assets.js';
export type NotificationPayload = AgentOutput | AvatarImageCommand;
export interface NotificationDeliveryOptions {
  id?: string;
  ttlSeconds?: number;
}
export interface NotificationResult {
  status: 'sent' | 'simulated' | 'invalid_token' | 'failed';
  messageId?: string;
}
export interface NotificationGateway {
  send(
    pushToken: string,
    payload: NotificationPayload,
    options?: NotificationDeliveryOptions,
  ): Promise<NotificationResult>;
}
