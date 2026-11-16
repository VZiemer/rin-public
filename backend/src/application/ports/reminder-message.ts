export interface ReminderMessage {
  message: string;
  sentAt: string;
  reminders: { id: string; title: string }[];
}

export interface ReminderMessageRepository {
  listRecent(userId: string, limit: number): Promise<ReminderMessage[]>;
}
