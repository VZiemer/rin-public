export interface RandomSource {
  integer(upperExclusive: number): number;
}
export interface ScheduledPushClaims {
  claim(userId: string, deviceId: string, scheduledAt: string, now: Date): Promise<boolean>;
}
