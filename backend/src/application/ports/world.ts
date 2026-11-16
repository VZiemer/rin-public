import type { SingletonRepository } from './context.js';
import type {
  ExchangeSnapshot,
  NewsItem,
  WeatherSnapshot,
  WorldInterest,
  WorldLocation,
  WorldSettings,
} from '../../domain/world/model.js';

export type WorldSettingsRepository = SingletonRepository<WorldSettings>;
export interface WorldSources {
  locate(city: string, region: string): Promise<WorldLocation>;
  weather(location: WorldLocation, now: Date): Promise<WeatherSnapshot>;
  news(interest: Exclude<WorldInterest, 'dolar'>, now: Date): Promise<NewsItem[]>;
  exchange(now: Date): Promise<ExchangeSnapshot>;
}
export interface MorningBriefingStore {
  /** Claim once per user and local day. Never automatically retry an ambiguous push. */
  claim(userId: string, date: string, now: Date): Promise<boolean>;
  finish(userId: string, date: string, status: 'sent' | 'failed', now: Date): Promise<void>;
}
