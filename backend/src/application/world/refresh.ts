import type { RinWorldContextRepository } from '../ports/context.js';
import type { WorldSettingsRepository, WorldSources } from '../ports/world.js';
import type { Clock } from '../ports/runtime.js';
import type { Logger } from '../ports/logger.js';
import type { NewsItem } from '../../domain/world/model.js';
import { freshWorldContext, record } from './context.js';

export class RefreshWorldContext {
  constructor(
    private readonly deps: {
      settings: WorldSettingsRepository;
      world: RinWorldContextRepository;
      sources: WorldSources;
      clock: Clock;
      logger: Logger;
    },
  ) {}
  async execute(userId: string): Promise<Record<string, unknown>> {
    const settings = await this.deps.settings.get(userId);
    if (!settings?.enabled) return { decision: 'SILENT', reason: 'world_disabled' };
    const now = this.deps.clock.now();
    const previous = await this.deps.world.get(userId);
    const compatible = previous?.settingsUpdatedAt === settings.updatedAt;
    const cached = compatible ? freshWorldContext(previous, now) : null;
    const categories = settings.interests.filter(
      (interest): interest is NewsItem['category'] => interest !== 'dolar',
    );
    const collect = async <T>(name: string, load: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await load();
      } catch (error) {
        this.deps.logger.event('world_source_failed', {
          userId,
          source: name,
          errorName: error instanceof Error ? error.name : typeof error,
        });
        return fallback;
      }
    };
    const oldItems = (record(cached?.news).items ?? []) as NewsItem[];
    const [weather, exchange, ...groups] = await Promise.all([
      collect('weather', () => this.deps.sources.weather(settings.location, now), cached?.weather),
      settings.interests.includes('dolar')
        ? collect('exchange', () => this.deps.sources.exchange(now), cached?.exchange)
        : Promise.resolve(undefined),
      ...categories.map((category) =>
        collect(
          `news_${category}`,
          () => this.deps.sources.news(category, now),
          oldItems.filter((item) => item.category === category),
        ),
      ),
    ]);
    // Preserve mention flags across refreshes; do not offer the same headline again at noon.
    const priorItems =
      compatible && Array.isArray(record(previous?.news).items)
        ? (record(previous?.news).items as NewsItem[])
        : [];
    const mentions = new Map(priorItems.map((item) => [item.id, item.mentionedToUserAt]));
    const items = [
      ...new Map(
        groups.flat().map((item) => [
          item.id,
          {
            ...item,
            mentionedToUserAt: mentions.get(item.id),
          },
        ]),
      ).values(),
    ].slice(0, 15);
    // Re-read consent/settings before persisting an external collection.
    if ((await this.deps.settings.get(userId))?.updatedAt !== settings.updatedAt)
      return { decision: 'SILENT', reason: 'settings_changed' };
    const ts = now.toISOString();
    await this.deps.world.put({
      ...previous,
      userId,
      createdAt: previous?.createdAt ?? ts,
      updatedAt: ts,
      settingsUpdatedAt: settings.updatedAt,
      location: settings.location,
      interests: settings.interests,
      weather,
      exchange,
      news: { items },
      dailyDigest: { items, weather, exchange },
      capturedAt: ts,
      validUntil: new Date(now.getTime() + 8 * 3600000).toISOString(),
    });
    const sourceCount =
      Number(Boolean(weather)) + Number(Boolean(exchange)) + Number(items.length > 0);
    this.deps.logger.event('world_refresh_completed', {
      userId,
      sourceCount,
      newsCount: items.length,
    });
    return {
      decision: sourceCount ? 'UPDATED' : 'FAILED',
      reason: sourceCount ? 'world_refreshed' : 'no_sources_available',
    };
  }
}
