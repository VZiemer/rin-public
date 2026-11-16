import type { AssetEnvironmentSource } from '../ports/rin-assets.js';
import type { WorldSettingsRepository } from '../ports/world.js';
import type { RinWorldContextRepository, RinLiveStateRepository } from '../ports/context.js';
import { freshWorldContext, moodWithWorld } from '../world/context.js';
import { moodWithNight, rinMoodContext } from '../agent/rin-mood.js';
import type { AssistantBehaviorRepository } from '../ports/assistant-behavior.js';
import { applyBehaviorMood } from '../behavior/runtime.js';
import { moodScoreAt } from '../../domain/model/behavior-evolution.js';

/** The catalog is shared; eligibility uses the recipient's own cached weather. */
export class WorldAssetEnvironment implements AssetEnvironmentSource {
  constructor(
    private settings: WorldSettingsRepository,
    private world: RinWorldContextRepository,
    private state?: RinLiveStateRepository,
    private timezone = 'America/Sao_Paulo',
    private behavior?: AssistantBehaviorRepository,
  ) {}
  async get(userId: string, now: Date, assistantId = 'RIN') {
    const [settings, stored, state] = await Promise.all([
      this.settings.get(userId),
      this.world.get(userId),
      this.state?.get(userId) ?? null,
    ]);
    const usable =
      settings?.enabled && settings.updatedAt === stored?.settingsUpdatedAt
        ? freshWorldContext(stored, now)
        : null;
    const timezone = settings?.location.timezone ?? this.timezone;
    const behavior = (await this.behavior?.get(userId, assistantId)) ?? null;
    const effectiveState = moodWithNight(
      moodWithWorld(
        applyBehaviorMood(
          state,
          behavior ? { state: behavior, currentMoodScore: moodScoreAt(behavior, now) } : null,
        ),
        usable,
      ),
      now,
      timezone,
    );
    return {
      weather: usable?.weather,
      timezone,
      mood: effectiveState ? rinMoodContext(effectiveState).effectiveTone : undefined,
    };
  }
}
