/** A message Rin actually sent, independent of the app's conversation id. */
export interface ProactiveMessage {
  message: string;
  sentAt: string;
  topic?: string | undefined;
  opportunity?: Record<string, unknown> | undefined;
}

export interface ProactiveMessageRepository {
  /** Most recent first; scoped to the internal user id. */
  listRecent(userId: string, limit: number): Promise<ProactiveMessage[]>;
}
