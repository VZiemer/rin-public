import type { AlertPreferences } from '../../domain/finance/alerts.js';

export interface AlertPreferenceRepository {
  get(userId: string, assistantId: string): Promise<AlertPreferences | null>;
  put(preferences: AlertPreferences): Promise<void>;
}
