import type {
  NotificationGateway,
  NotificationResult,
  NotificationPayload,
} from '../../../application/ports/notification.js';
export class ConsoleNotificationGateway implements NotificationGateway {
  constructor(private log: (metadata: Record<string, string>) => void = console.info) {}
  async send(_pushToken: string, payload: NotificationPayload): Promise<NotificationResult> {
    this.log({
      event: 'notification_simulated',
      ...('type' in payload
        ? { type: payload.type, assistantId: payload.assistantId, imageName: payload.imageName }
        : {
            priority: payload.priority,
            avatarState: payload.avatarState,
          }),
    });
    return { status: 'simulated' };
  }
}
