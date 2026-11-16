import { z } from 'zod';
import type { AlertPreferenceRepository } from '../../../application/ports/alert-preferences.js';
import type { AlertPreferences } from '../../../domain/finance/alerts.js';
import { owned } from './schemas.js';
import { DynamoStore, type DocumentClient } from './store.js';

const schema = owned.extend({
  id: z.string(),
  assistantId: z.string(),
  enabled: z.boolean(),
  pausedUntil: z.string().optional(),
  maxPerDay: z.number().int().positive(),
  leadDays: z.number().int().nonnegative(),
  discretePush: z.boolean(),
});

export class DynamoDbAlertPreferenceRepository implements AlertPreferenceRepository {
  private readonly store: DynamoStore<AlertPreferences>;

  constructor(client: DocumentClient, table: string) {
    this.store = new DynamoStore(client, table, 'ALERT_PREFERENCE', schema);
  }

  async get(userId: string, assistantId: string) {
    const record = await this.store.get(userId, assistantId);
    if (!record || record.assistantId !== assistantId) return null;
    return record;
  }

  put(preferences: AlertPreferences) {
    return this.store.put({ ...preferences, id: preferences.assistantId }, preferences.assistantId).then(
      () => undefined,
    );
  }
}
