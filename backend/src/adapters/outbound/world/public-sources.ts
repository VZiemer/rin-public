import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import type { WorldSources } from '../../../application/ports/world.js';
import type { NewsItem, WorldLocation, WorldInterest } from '../../../domain/world/model.js';

const number = z.number().finite();
const geocodingSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        admin1: z.string().default(''),
        country_code: z.string(),
        latitude: number,
        longitude: number,
        timezone: z.string(),
        feature_code: z.string(),
      }),
    )
    .default([]),
});
const weatherSchema = z.object({
  current: z.object({
    time: number,
    temperature_2m: number,
    precipitation: number,
    weather_code: number,
  }),
  daily: z.object({
    time: z.array(number),
    weather_code: z.array(number),
    temperature_2m_max: z.array(number),
    temperature_2m_min: z.array(number),
    precipitation_probability_max: z.array(number),
  }),
});
const exchangeSchema = z.object({
  USDBRL: z.object({
    bid: z.coerce.number().positive(),
    ask: z.coerce.number().positive(),
    pctChange: z.coerce.number().finite(),
    timestamp: z.coerce.number().positive(),
  }),
});
const feedSchema = z.object({
  rss: z.object({
    channel: z.object({
      item: z
        .array(
          z.object({
            title: z.string(),
            link: z.string().url(),
            pubDate: z.string(),
            'atom:subtitle': z.string().optional(),
            description: z.string().optional(),
          }),
        )
        .default([]),
    }),
  }),
});
const feeds = {
  politica: 'https://g1.globo.com/rss/g1/politica/',
  economia: 'https://g1.globo.com/rss/g1/economia/',
  tecnologia: 'https://g1.globo.com/rss/g1/tecnologia/',
} as const;
const simplify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const plainText = (text: string, limit: number) =>
  text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
const validUntil = (now: Date) => new Date(now.getTime() + 8 * 3600000).toISOString();

/** Fixed public endpoints: user preferences never become arbitrary URLs. */
export class PublicWorldSources implements WorldSources {
  private readonly parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    processEntities: true,
    isArray: (_name, path) => path === 'rss.channel.item',
  });
  private readonly requests = new Map<string, Promise<string>>();

  private request(url: string): Promise<string> {
    // Deduplicate public requests within this collection run, without caching between Lambda invocations.
    const existing = this.requests.get(url);
    if (existing) return existing;
    const pending = this.fetchText(url);
    this.requests.set(url, pending);
    return pending;
  }
  private async fetchText(url: string): Promise<string> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      headers: {
        'User-Agent': 'Rin-Personal-Briefing/1.0',
        Accept: 'application/json, application/rss+xml, application/xml',
      },
    });
    if (!response.ok || !response.body) throw new Error(`world_source_http_${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1500000) throw new Error('world_source_response_too_large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const merged = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
  }
  async locate(city: string, region: string): Promise<WorldLocation> {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({
      name: city,
      count: '10',
      language: 'pt',
      countryCode: 'BR',
    }).toString();
    const data = geocodingSchema.parse(JSON.parse(await this.request(url.toString())));
    const normalizedRegion = simplify(region) === 'sp' ? 'sao paulo' : simplify(region);
    const matches = data.results.filter(
      (item) =>
        item.country_code === 'BR' &&
        item.feature_code.startsWith('PPL') &&
        simplify(item.name) === simplify(city) &&
        (!region || simplify(item.admin1) === normalizedRegion),
    );
    const match = matches.length === 1 ? matches[0] : undefined;
    if (!match)
      throw new Error('City ambiguous or not found. Provide the city and state name.');
    if (match.timezone !== 'America/Sao_Paulo')
      throw new Error('The briefing currently supports cities in the Sao Paulo time zone.');
    return {
      city: match.name,
      region: match.admin1,
      countryCode: match.country_code,
      latitude: match.latitude,
      longitude: match.longitude,
      timezone: match.timezone,
    };
  }
  async weather(location: WorldLocation, now: Date) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      timezone: location.timezone,
      current: 'temperature_2m,precipitation,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
      forecast_days: '1',
      timeformat: 'unixtime',
    }).toString();
    const value = weatherSchema.parse(JSON.parse(await this.request(url.toString())));
    const max = value.daily.temperature_2m_max[0];
    const min = value.daily.temperature_2m_min[0];
    const rainProbability = value.daily.precipitation_probability_max[0];
    const day = value.daily.time[0];
    const forecastConditionCode = value.daily.weather_code[0];
    if (
      max === undefined ||
      min === undefined ||
      rainProbability === undefined ||
      day === undefined ||
      forecastConditionCode === undefined
    )
      throw new Error('weather_missing_forecast');
    const observedAt = new Date(value.current.time * 1000).toISOString();
    if (Math.abs(now.getTime() - Date.parse(observedAt)) > 2 * 3600000)
      throw new Error('weather_observation_outdated');
    const forecastDate = new Intl.DateTimeFormat('en-CA', { timeZone: location.timezone }).format(
      new Date(day * 1000),
    );
    return {
      source: 'Open-Meteo',
      sourceUrl: 'https://open-meteo.com/',
      observedAt,
      fetchedAt: now.toISOString(),
      validUntil: validUntil(now),
      facts: {
        city: location.city,
        temperatureC: value.current.temperature_2m,
        conditionCode: value.current.weather_code,
        raining: value.current.precipitation > 0,
        forecastDate,
        forecastConditionCode,
        forecastMaxC: max,
        forecastMinC: min,
        rainProbabilityPercent: rainProbability,
      },
    };
  }
  async news(interest: Exclude<WorldInterest, 'dolar'>, now: Date): Promise<NewsItem[]> {
    const xml = await this.request(feeds[interest]);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('rss_doctype_forbidden');
    const feed = feedSchema.parse(this.parser.parse(xml));
    return feed.rss.channel.item
      .flatMap((item) => {
        const timestamp = Date.parse(item.pubDate);
        if (
          !Number.isFinite(timestamp) ||
          timestamp > now.getTime() + 300000 ||
          now.getTime() - timestamp > 36 * 3600000
        )
          return [];
        const url = new URL(item.link);
        if (url.protocol !== 'https:' || url.hostname !== 'g1.globo.com') return [];
        url.search = '';
        url.hash = '';
        return [
          {
            id: url.toString(),
            url: url.toString(),
            category: interest,
            headline: plainText(item.title, 220),
            summary: plainText(item['atom:subtitle'] ?? '', 320),
            source: 'g1',
            sourceUrl: url.toString(),
            observedAt: new Date(timestamp).toISOString(),
            fetchedAt: now.toISOString(),
            validUntil: new Date(
              Math.min(now.getTime() + 8 * 3600000, timestamp + 36 * 3600000),
            ).toISOString(),
          },
        ];
      })
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
      .slice(0, 5);
  }
  async exchange(now: Date) {
    const sourceUrl = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';
    const { USDBRL: value } = exchangeSchema.parse(JSON.parse(await this.request(sourceUrl)));
    const observedAt = new Date(value.timestamp * 1000).toISOString();
    const age = now.getTime() - Date.parse(observedAt);
    if (age < -300000 || age > 4 * 86400000) throw new Error('exchange_observation_outdated');
    return {
      source: 'AwesomeAPI',
      sourceUrl,
      observedAt,
      fetchedAt: now.toISOString(),
      validUntil: new Date(
        Math.min(now.getTime() + 8 * 3600000, Date.parse(observedAt) + 4 * 86400000),
      ).toISOString(),
      pair: 'USD/BRL' as const,
      bid: value.bid,
      ask: value.ask,
      changePercent: value.pctChange,
    };
  }
}
