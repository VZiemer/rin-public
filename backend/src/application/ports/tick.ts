export interface RinInitiativeStore {
  /** Upsert only the `initiative` block of the RIN_STATE singleton. */
  saveInitiative(userId: string, initiative: Record<string, unknown>, now: Date): Promise<void>;
}
export interface TickUserSource {
  /** Internal user ids that own at least one enabled device. */
  listUserIdsWithDevices(): Promise<string[]>;
}
export type RinLogType = 'RIN_REMINDER_LOG' | 'RIN_PROACTIVE_LOG';
export interface RinLogRepository {
  append(
    type: RinLogType,
    userId: string,
    payload: Record<string, unknown>,
    now: Date,
  ): Promise<void>;
}
