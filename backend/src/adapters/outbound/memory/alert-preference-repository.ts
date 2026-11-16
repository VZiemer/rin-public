import type { AlertPreferenceRepository } from '../../../application/ports/alert-preferences.js';
import type { AlertPreferences } from '../../../domain/finance/alerts.js';

export class InMemoryAlertPreferenceRepository implements AlertPreferenceRepository {
  private readonly records = new Map<string, AlertPreferences>();

  async get(userId: string, assistantId: string) {
    return this.records.get(`${userId}#${assistantId}`) ?? null;
  }

  async put(preferences: AlertPreferences) {
    this.records.set(`${preferences.userId}#${preferences.assistantId}`, preferences);
  }
}
