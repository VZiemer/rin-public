import type { SupportConsent } from '../../domain/skills/consent.js';

export interface SupportConsentRepository {
  get(userId: string, assistantId: string, id: string): Promise<SupportConsent | null>;
  put(consent: SupportConsent): Promise<void>;
  list(userId: string, assistantId: string): Promise<SupportConsent[]>;
  delete(userId: string, assistantId: string, id: string): Promise<void>;
}
