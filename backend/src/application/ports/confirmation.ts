import type { PendingConfirmation } from '../../domain/model/contracts.js';
export interface ConfirmationRepository {
  create(value: PendingConfirmation): Promise<void>;
  get(userId: string, id: string): Promise<PendingConfirmation | null>;
  transition(
    userId: string,
    id: string,
    from: PendingConfirmation['status'],
    to: PendingConfirmation['status'],
    now: number,
  ): Promise<boolean>;
}
