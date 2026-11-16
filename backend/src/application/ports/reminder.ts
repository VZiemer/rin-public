import type { Reminder } from '../../domain/model/contracts.js';
export interface ReminderRepository {
  get(userId: string, id: string): Promise<Reminder | null>;
  list(userId: string, limit?: number): Promise<Reminder[]>;
  create(reminder: Reminder): Promise<void>;
  update(reminder: Reminder, expectedUpdatedAt: string): Promise<boolean>;
  updateNotificationState(
    userId: string,
    id: string,
    notificationState: Record<string, unknown>,
    now: Date,
  ): Promise<void>;
}
