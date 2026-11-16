import type { OwnedEntity } from '../model/contracts.js';

export const worldInterests = ['politica', 'economia', 'dolar', 'tecnologia'] as const;
export type WorldInterest = (typeof worldInterests)[number];
export interface WorldLocation {
  city: string;
  region: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
}
export interface WorldSettings extends OwnedEntity {
  enabled: boolean;
  morningBriefingEnabled: boolean;
  location: WorldLocation;
  interests: WorldInterest[];
}
export interface WorldFact {
  source: string;
  sourceUrl: string;
  observedAt: string;
  fetchedAt: string;
  validUntil: string;
}
export interface WeatherSnapshot extends WorldFact {
  facts: {
    city: string;
    temperatureC: number;
    conditionCode: number;
    raining: boolean;
    forecastDate: string;
    forecastConditionCode?: number;
    forecastMaxC: number;
    forecastMinC: number;
    rainProbabilityPercent: number;
  };
}
export interface NewsItem extends WorldFact {
  id: string;
  category: Exclude<WorldInterest, 'dolar'>;
  headline: string;
  summary: string;
  url: string;
  mentionedToUserAt?: string | undefined;
}
export interface ExchangeSnapshot extends WorldFact {
  pair: 'USD/BRL';
  bid: number;
  ask: number;
  changePercent: number;
}
