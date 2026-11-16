import type { OwnedEntity } from '../../domain/model/contracts.js';

export interface AlertPreferences extends OwnedEntity {
  id: string;
  assistantId: string;
  enabled: boolean;
  pausedUntil?: string | undefined;
  maxPerDay: number;
  leadDays: number;
  discretePush: boolean;
}

export function defaultAlertPreferences(userId: string, assistantId: string, now: Date): AlertPreferences {
  const at = now.toISOString();
  return {
    id: assistantId,
    userId,
    assistantId,
    enabled: true,
    maxPerDay: 2,
    leadDays: 2,
    discretePush: true,
    createdAt: at,
    updatedAt: at,
  };
}
