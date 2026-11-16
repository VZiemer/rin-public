import type { Messaging } from 'firebase-admin/messaging';
import { randomUUID } from 'node:crypto';
import type {
  NotificationGateway,
  NotificationResult,
  NotificationPayload,
  NotificationDeliveryOptions,
} from '../../../application/ports/notification.js';
import { avatarImageCommandSchema } from '../../../domain/model/rin-assets.js';
import { agentOutputSchema } from '../../../domain/model/validation.js';
import { AppError } from '../../../domain/errors/app-error.js';
export class FirebaseNotificationGateway implements NotificationGateway {
  constructor(private messaging: Pick<Messaging, 'send'>) {}
  async send(
    pushToken: string,
    input: NotificationPayload,
    options: NotificationDeliveryOptions = {},
  ): Promise<NotificationResult> {
    const payload =
      'type' in input ? avatarImageCommandSchema.parse(input) : agentOutputSchema.parse(input);
    const data: Record<string, string> =
      'type' in payload
        ? { ...payload }
        : {
            id: options.id ?? randomUUID(),
            type: 'ASSISTANT_MESSAGE',
            assistantId: payload.assistantId ?? 'RIN',
            message: payload.message,
            avatarState: payload.avatarState,
            priority: payload.priority,
            actions: JSON.stringify(payload.actions),
            ...(payload.imageName != null ? { imageName: payload.imageName } : {}),
          };
    if (!('type' in payload) && (data.id!.length > 256 || !data.id!.trim()))
      throw new AppError('invalid_notification_id', 400);
    const ttl = 'type' in payload ? 3600 : (options.ttlSeconds ?? 3600);
    if (!Number.isInteger(ttl) || ttl < 0 || ttl > 86400)
      throw new AppError('invalid_notification_ttl', 400);
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 3500)
      throw new AppError('notification_payload_too_large', 413);
    try {
      const messageId = await this.messaging.send({
        token: pushToken,
        data,
        android: {
          priority: !('type' in payload) && payload.priority !== 'LOW' ? 'high' : 'normal',
          ttl: ttl * 1000,
        },
      });
      return { status: 'sent', messageId };
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      return {
        status:
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
            ? 'invalid_token'
            : 'failed',
      };
    }
  }
}
