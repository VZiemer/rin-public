import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { notificationGateway } from './notifications.js';
import { logFields } from '../application/ports/logger.js';
import { DynamoDbDeviceRepository } from '../adapters/outbound/dynamodb/device-repository.js';
import { DynamoDbWorkingMemoryRepository } from '../adapters/outbound/dynamodb/working-memory-repository.js';
import {
  DynamoDbRinInitiativeStore,
  DynamoDbRinLogRepository,
  DynamoDbTickUserSource,
} from '../adapters/outbound/dynamodb/tick-repositories.js';
import { BedrockRinTextGateway } from '../adapters/outbound/agent-model/bedrock-text.js';
import {
  DynamoDbPersonaRepository,
  DynamoDbRelationshipRepository,
  DynamoDbRinEpisodeRepository,
  DynamoDbRinPreferencesRepository,
  DynamoDbRinStateRepository,
  DynamoDbRinWorldContextRepository,
  DynamoDbUserProfileRepository,
} from '../adapters/outbound/dynamodb/context-repositories.js';
import { ProactiveTick, type ProactiveTickDeps } from '../application/use-cases/proactive-tick.js';
import { runPerUserTick } from '../application/use-cases/per-user-tick.js';
import { SkillAlertTick } from '../application/use-cases/skill-alert-tick.js';
import { createSkillRegistry } from '../application/skills/catalog.js';
import { SkillEnablement } from '../application/skills/enablement.js';
import { contextRepositories } from './repositories.js';
import {
  DynamoDbWorldSettingsRepository,
  DynamoDbMorningBriefingStore,
} from '../adapters/outbound/dynamodb/world-repository.js';
import { MorningBriefing } from '../application/world/morning-briefing.js';
import { localDateTime } from '../application/agent/clock-zone.js';
import { z } from 'zod';
import { RinVisualAssets } from '../application/assets/selection.js';
import { DynamoDbRinAssetCatalogRepository } from '../adapters/outbound/dynamodb/rin-asset-repository.js';
import { assetEnvironment } from './asset-environment.js';
import { withRinTextStyle } from '../application/agent/rin-style-text.js';
import { BehaviorRuntime } from '../application/behavior/runtime.js';

type Runner = (event: unknown) => Promise<Record<string, unknown>>;
const manualMorningSchema = z
  .object({
    kind: z.literal('morning_briefing'),
    userId: z.string().uuid().optional(),
    force: z.boolean().default(false),
    requestId: z
      .string()
      .regex(/^[\w-]{1,100}$/)
      .optional(),
  })
  .refine((value) => !value.force || Boolean(value.userId && value.requestId), {
    message: 'Forced morning briefing requires userId and requestId',
  });
let runner: Promise<Runner> | undefined;

async function createRunner(): Promise<Runner> {
  const config = loadConfig();
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: config.region, maxAttempts: 2 }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  const table = config.tableName;
  const worldSettings = new DynamoDbWorldSettingsRepository(client, table);
  const morningStore = new DynamoDbMorningBriefingStore(client, table);
  const users = new DynamoDbTickUserSource(client, table);
  const visualAssets = new RinVisualAssets(
    new DynamoDbRinAssetCatalogRepository(client, table),
    { now: () => new Date() },
    config.timezone,
    logger,
    assetEnvironment(client, table, config.timezone),
  );
  const shared: Omit<ProactiveTickDeps, 'userId'> = {
    visualAssets,
    worldSettings,
    rinState: new DynamoDbRinStateRepository(client, table),
    rinPreferences: new DynamoDbRinPreferencesRepository(client, table),
    rinWorldContext: new DynamoDbRinWorldContextRepository(client, table),
    persona: new DynamoDbPersonaRepository(client, table),
    profile: new DynamoDbUserProfileRepository(client, table),
    relationship: new DynamoDbRelationshipRepository(client, table),
    rinEpisodes: new DynamoDbRinEpisodeRepository(client, table),
    devices: new DynamoDbDeviceRepository(client, table),
    workingMemory: new DynamoDbWorkingMemoryRepository(client, table, { now: () => new Date() }),
    initiative: new DynamoDbRinInitiativeStore(client, table),
    text: new BedrockRinTextGateway(
      new BedrockRuntimeClient({ region: config.region, maxAttempts: 1 }),
      config.bedrockModelId,
    ),
    notifications: await notificationGateway(config.region, config.firebaseSecretArn),
    logs: new DynamoDbRinLogRepository(client, table),
    random: { next: () => Math.random() },
    clock: { now: () => new Date() },
    logger,
    config: { timezone: config.timezone, ...config.proactive },
  };
  const skillRepos = contextRepositories();
  const behavior = new BehaviorRuntime(
    skillRepos.assistantBehavior,
    skillRepos.personalities,
    skillRepos.assistants,
  );
  const skillAlertDeps = {
    finance: skillRepos.finance,
    preferences: skillRepos.alertPreferences,
    followUps: skillRepos.followUps,
    consents: skillRepos.supportConsents,
    threads: skillRepos.skillThreads,
    enablement: new SkillEnablement(createSkillRegistry(), skillRepos.skillEnablement),
    state: shared.rinState,
    initiative: shared.initiative,
    reminders: skillRepos.reminders,
    devices: shared.devices,
    notifications: shared.notifications,
    clock: shared.clock,
    config: shared.config,
    logger,
  };
  return (event) => {
    const morning =
      event && typeof event === 'object' && 'kind' in event && event.kind === 'morning_briefing'
        ? manualMorningSchema.parse(event)
        : null;
    return runPerUserTick({
      name: 'proactive_tick',
      users: morning?.userId ? { listUserIdsWithDevices: async () => [morning.userId!] } : users,
      logger,
      run: async (userId) => {
        const text = withRinTextStyle(shared.text, () =>
          behavior.get(userId, 'RIN', shared.clock.now()),
        );
        const notifications = visualAssets.notifications(
          shared.notifications,
          userId,
          morning ? 'morning_briefing' : 'message',
        );
        if (morning)
          return new MorningBriefing({
            ...shared,
            text,
            behavior,
            notifications,
            userId,
            worldSettings,
            morningStore,
          }).execute({
            force: morning.force,
            ...(morning.requestId ? { requestId: morning.requestId } : {}),
          });
        // Reserve this slot so the regular tick does not race the morning greeting.
        const local = localDateTime(new Date(), config.timezone);
        if (local.time >= '08:00' && local.time < '08:15') {
          const settings = await worldSettings.get(userId);
          if (settings?.enabled && settings.morningBriefingEnabled)
            return { decision: 'SILENT', reason: 'morning_slot_reserved' };
        }
        const skillResult = await new SkillAlertTick({ ...skillAlertDeps, notifications }).execute(
          userId,
          event,
        );
        if (skillResult.allowMood !== true) return skillResult;
        return new ProactiveTick({ ...shared, text, behavior, notifications, userId }).execute(
          event,
        );
      },
    });
  };
}

export async function handler(event: unknown) {
  const config = loadConfig();
  if (!config.proactiveTickEnabled) return { decision: 'SILENT', reason: 'disabled' };
  try {
    return await (
      await (runner ??= createRunner())
    )(event);
  } catch (error) {
    runner = undefined;
    logger.event(
      'proactive_tick_error',
      logFields({
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
}
