import type { OwnedEntity } from '../model/contracts.js';

export type ConsentPurpose = 'talk_now' | 'store_preference' | 'follow_up_push';

export interface SupportConsent extends OwnedEntity {
  id: string;
  assistantId: string;
  purpose: ConsentPurpose;
  subject: string;
  status: 'granted' | 'revoked' | 'deleted';
  grantedAt: string;
  expiresAt: string;
}

const DAY = 24 * 60 * 60 * 1000;

export function consentExpiry(purpose: ConsentPurpose, now: Date): string {
  const days = purpose === 'talk_now' ? 1 : purpose === 'follow_up_push' ? 7 : 14;
  return new Date(now.getTime() + days * DAY).toISOString();
}
