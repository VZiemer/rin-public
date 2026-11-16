import { z } from 'zod';
import type { SupportConsentRepository } from '../../../application/ports/support-consent.js';
import type { SupportConsent } from '../../../domain/skills/consent.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';

const schema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  purpose: z.enum(['talk_now', 'store_preference', 'follow_up_push']),
  subject: z.string(),
  status: z.enum(['granted', 'revoked', 'deleted']),
  grantedAt: z.string(),
  expiresAt: z.string(),
});

export class DynamoDbSupportConsentRepository implements SupportConsentRepository {
  private readonly store: DynamoStore<SupportConsent>;

  constructor(client: DocumentClient, table: string) {
    this.store = new DynamoStore(client, table, 'SUPPORT_CONSENT', schema);
  }

  async get(userId: string, assistantId: string, id: string) {
    const record = await this.store.get(userId, id);
    if (!record || record.assistantId !== assistantId) return null;
    return record;
  }

  put(consent: SupportConsent) {
    return this.store.put(consent, consent.id).then(() => undefined);
  }

  async list(userId: string, assistantId: string) {
    const records = await this.store.list(userId, 50);
    return records.filter((consent) => consent.assistantId === assistantId && consent.status !== 'deleted');
  }

  async delete(userId: string, assistantId: string, id: string) {
    const record = await this.get(userId, assistantId, id);
    if (record) await this.store.delete(userId, id);
  }
}
