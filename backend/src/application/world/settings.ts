import { z } from 'zod';
import { worldInterests } from '../../domain/world/model.js';
import type { WorldSettingsRepository, WorldSources } from '../ports/world.js';
import type { Clock } from '../ports/runtime.js';
import { defineTool } from '../agent/tools.js';

const settingsInput = z
  .object({
    enabled: z.boolean().optional(),
    morningBriefingEnabled: z.boolean().optional(),
    city: z.string().trim().min(2).max(100).optional(),
    region: z.string().trim().min(2).max(100).optional(),
    interests: z.array(z.enum(worldInterests)).max(4).optional(),
  })
  .strict();

export class WorldPreferences {
  constructor(
    private readonly repo: WorldSettingsRepository,
    private readonly source: Pick<WorldSources, 'locate'>,
    private readonly clock: Clock,
  ) {}
  async get(userId: string) {
    return this.repo.get(userId);
  }
  async update(userId: string, input: z.infer<typeof settingsInput>) {
    const value = settingsInput.parse(input);
    const previous = await this.repo.get(userId);
    if (!previous && !value.city)
      throw new Error('Enter your city to configure world context.');
    const location =
      value.city || value.region
        ? await this.source.locate(
            value.city ?? previous!.location.city,
            value.region ?? previous?.location.region ?? '',
          )
        : previous!.location;
    const now = this.clock.now().toISOString();
    const settings = {
      userId,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      location,
      enabled: value.enabled ?? previous?.enabled ?? true,
      morningBriefingEnabled:
        value.morningBriefingEnabled ?? previous?.morningBriefingEnabled ?? true,
      interests: [...new Set(value.interests ?? previous?.interests ?? [])],
    };
    await this.repo.put(settings);
    return settings;
  }
}

export function worldTools(preferences: WorldPreferences) {
  return [
    defineTool({
      name: 'get_world_preferences',
      description:
        'Read the user city, news interests, world collection and morning greeting preferences.',
      risk: 'READ',
      inputSchema: z.object({}).strict(),
      execute: (_, context) => preferences.get(context.userId),
    }),
    defineTool({
      name: 'set_world_preferences',
      description:
        'Only on explicit user request: configure city (Brazil), region, interests (politica/economia/dolar/tecnologia), enable or disable world collection or the 08:00 morning greeting. Omitted fields stay unchanged. Does not fetch live news.',
      risk: 'WRITE',
      inputSchema: settingsInput,
      execute: (input, context) => preferences.update(context.userId, input),
    }),
  ];
}
