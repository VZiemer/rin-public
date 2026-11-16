import type { SupportConsentRepository } from '../../../application/ports/support-consent.js';
import type { SupportConsent } from '../../../domain/skills/consent.js';

export class InMemorySupportConsentRepository implements SupportConsentRepository {
  private readonly records = new Map<string, SupportConsent>();

  async get(userId: string, assistantId: string, id: string) {
    const record = this.records.get(`${userId}#${id}`);
    if (!record || record.assistantId !== assistantId) return null;
    return record;
  }

  async put(consent: SupportConsent) {
    this.records.set(`${consent.userId}#${consent.id}`, consent);
  }

  async list(userId: string, assistantId: string) {
    return [...this.records.values()].filter(
      (consent) => consent.userId === userId && consent.assistantId === assistantId && consent.status !== 'deleted',
    );
  }

  async delete(userId: string, assistantId: string, id: string) {
    const record = await this.get(userId, assistantId, id);
    if (record) this.records.delete(`${userId}#${id}`);
  }
}
