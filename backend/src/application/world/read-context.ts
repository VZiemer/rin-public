import { z } from 'zod';
import { defineTool } from '../agent/tools.js';
import type { RinWorldContextRepository } from '../ports/context.js';
import type { WorldSettingsRepository } from '../ports/world.js';
import type { Clock } from '../ports/runtime.js';
import { freshWorldContext, record } from './context.js';

const topics = ['geral', 'politica', 'economia', 'tecnologia', 'dolar', 'clima'] as const;
const inputSchema = z
  .object({
    topic: z.enum(topics).default('geral'),
    limit: z.number().int().min(1).max(5).default(3),
  })
  .strict();

/** Reads stored observations only. No source/provider capable of network collection is injected. */
export class ReadWorldContext {
  constructor(
    private readonly deps: {
      settings: WorldSettingsRepository;
      world: RinWorldContextRepository;
      clock: Clock;
    },
  ) {}

  async execute(userId: string, input: z.infer<typeof inputSchema>) {
    const query = inputSchema.parse(input);
    const now = this.deps.clock.now();
    const [settings, stored] = await Promise.all([
      this.deps.settings.get(userId),
      this.deps.world.get(userId),
    ]);
    const base = {
      topic: query.topic,
      requestedAt: now.toISOString(),
      collectedAt: stored?.capturedAt ?? null,
      liveSearchPerformed: false,
    };
    if (!settings?.enabled)
      return { ...base, status: 'disabled', items: [], weather: null, exchange: null };
    if (!stored || stored.settingsUpdatedAt !== settings.updatedAt)
      return { ...base, status: 'not_collected', items: [], weather: null, exchange: null };
    const world = freshWorldContext(stored, now);
    const rawItems = record(world?.news).items;
    const items = (Array.isArray(rawItems) ? rawItems : [])
      .map(record)
      .filter((item) => query.topic === 'geral' || item.category === query.topic)
      .sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)))
      .slice(0, query.limit);
    const weather =
      query.topic === 'geral' || query.topic === 'clima' ? (world?.weather ?? null) : null;
    const exchange =
      query.topic === 'geral' || query.topic === 'dolar' ? (world?.exchange ?? null) : null;
    return {
      ...base,
      status: items.length || weather || exchange ? 'available' : 'unavailable',
      location: settings.location,
      items,
      weather,
      exchange,
      guidance:
        'Use only these cached facts. observedAt is publication/observation time, not collection time. No live search. If unavailable, say no valid collected data for this topic; do not invent facts or silently change preferences.',
    };
  }
}

export function worldContextTool(reader: ReadWorldContext) {
  return defineTool({
    name: 'get_world_context',
    description:
      'Read cached daily headlines, weather or USD/BRL from the user world context in DynamoDB. Use for questions such as "what is happening in politics today?". Filters by topic and freshness; includes source URLs and publication/observation times. Never searches the web or refreshes external sources. News already mentioned still appear when explicitly requested.',
    risk: 'READ',
    inputSchema,
    execute: (input, context) => reader.execute(context.userId, input),
  });
}
