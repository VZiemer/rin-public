import type { AssistantRepository } from '../ports/assistant.js';
import type { TaskRepository } from '../ports/task.js';
import type { ReminderRepository } from '../ports/reminder.js';
import type {
  PersonaRepository,
  UserProfileRepository,
  RelationshipRepository,
  RoutineRepository,
  PersonRepository,
  ShoppingItemRepository,
  RinLiveStateRepository,
  RinPreferencesRepository,
  RinWorldContextRepository,
  RinEpisodeRepository,
} from '../ports/context.js';
import type { MemoryRepository, WorkingMemoryRepository } from '../ports/memory.js';
import type { ProactiveMessageRepository } from '../ports/proactive-message.js';
import type { ReminderMessageRepository } from '../ports/reminder-message.js';
import type { WorldSettingsRepository } from '../ports/world.js';
import type { RinAssetCatalogRepository } from '../ports/rin-assets.js';
import type { RinAssetOccasion } from '../../domain/model/rin-assets.js';
import { freshWorldContext, moodWithWorld } from '../world/context.js';
import { moodWithNight, rinMoodContext } from './rin-mood.js';
import { localSchedule } from './localized-tool.js';
import { applyBehaviorMood, type BehaviorRuntime } from '../behavior/runtime.js';
import type { RuntimeContextProvider } from '../ports/runtime-context.js';
import type { AssistantDefinition } from '../../domain/model/assistant.js';
import { DEFAULT_ASSISTANT_ID, parseAssistantId } from '../../domain/model/assistant-id.js';
import type {
  Persona,
  RelationshipConfig,
  Routine,
  UserProfile,
} from '../../domain/model/contracts.js';
export interface ContextRepositories {
  behavior?: BehaviorRuntime;
  rinAssetCatalog?: RinAssetCatalogRepository;
  worldSettings?: WorldSettingsRepository;
  persona: PersonaRepository;
  profile: UserProfileRepository;
  relationship: RelationshipRepository;
  routine: RoutineRepository;
  people: PersonRepository;
  shopping?: ShoppingItemRepository;
  rinState?: RinLiveStateRepository;
  rinPreferences?: RinPreferencesRepository;
  rinWorldContext?: RinWorldContextRepository;
  rinEpisodes?: RinEpisodeRepository;
  assistants?: AssistantRepository;
  proactiveMessages?: ProactiveMessageRepository;
  reminderMessages?: ReminderMessageRepository;
}
export class AgentContextBuilder {
  constructor(
    private repos: ContextRepositories,
    private runtime: RuntimeContextProvider,
    private memory?: MemoryRepository,
    private working?: WorkingMemoryRepository,
    private tasks?: TaskRepository,
    private reminders?: ReminderRepository,
  ) {}
  async build(userId: string, conversationId: string, assistantId = DEFAULT_ASSISTANT_ID) {
    const selectedAssistantId = parseAssistantId(assistantId, DEFAULT_ASSISTANT_ID);
    const [
      assistant,
      fallbackPersona,
      profile,
      relationship,
      routine,
      people,
      runtime,
      longTermMemory,
      workingMemory,
      tasks,
      reminders,
      shoppingItems,
      rinState,
      rinPreferences,
      rinWorldContext,
      rinEpisodes,
      recentProactiveMessages,
      recentReminderMessages,
      worldSettings,
      rinAssetCatalog,
    ] = await Promise.all([
      this.repos.assistants?.getById(selectedAssistantId) ?? Promise.resolve(null),
      this.repos.persona.get(userId),
      this.repos.profile.get(userId),
      this.repos.relationship.get(userId, selectedAssistantId),
      this.repos.routine.get(userId),
      this.repos.people.list(userId, 20),
      this.runtime.get(userId),
      this.memory?.list(userId, { limit: 20 }) ?? [],
      this.working?.get(userId, conversationId, selectedAssistantId) ?? null,
      this.tasks?.list(userId, 20) ?? [],
      this.reminders?.list(userId, 20) ?? [],
      this.repos.shopping?.list(userId, 50) ?? [],
      this.repos.rinState?.get(userId) ?? null,
      this.repos.rinPreferences?.get(userId) ?? null,
      this.repos.rinWorldContext?.get(userId) ?? null,
      this.repos.rinEpisodes?.list(userId, 20) ?? [],
      selectedAssistantId === 'RIN'
        ? (this.repos.proactiveMessages?.listRecent(userId, 5) ?? [])
        : [],
      selectedAssistantId === 'RIN'
        ? (this.repos.reminderMessages?.listRecent(userId, 5) ?? [])
        : [],
      this.repos.worldSettings?.get(userId) ?? null,
      this.repos.rinAssetCatalog?.get(selectedAssistantId).catch(() => null) ?? null,
    ]);
    const persona = personaFromAssistant(assistant, fallbackPersona, userId, runtime.currentTime);
    if (!persona) throw new Error('Context not initialized; run the seed command');
    const now = runtime.currentTime;
    const behavior =
      (await this.repos.behavior?.get(userId, selectedAssistantId, new Date(now))) ?? null;
    const baseState = applyBehaviorMood(selectedAssistantId === 'RIN' ? rinState : null, behavior);
    const usableWorld =
      this.repos.worldSettings &&
      (!worldSettings?.enabled || worldSettings.updatedAt !== rinWorldContext?.settingsUpdatedAt)
        ? null
        : freshWorldContext(rinWorldContext, new Date(now));
    const timezone = worldSettings?.location.timezone ?? runtime.timezone;
    const effectiveState =
      selectedAssistantId === 'RIN' || behavior
        ? moodWithNight(moodWithWorld(baseState, usableWorld), new Date(now), timezone)
        : null;
    return {
      assistantId: selectedAssistantId,
      behavior,
      rinAssetCatalog,
      assistant,
      assetEnvironment: {
        occasion: 'conversation' as RinAssetOccasion,
        mood: effectiveState ? rinMoodContext(effectiveState).effectiveTone : undefined,
        weather: usableWorld?.weather,
        timezone,
      },
      tasks: tasks.filter((task) => task.status === 'pending'),
      reminders: reminders
        .filter((reminder) => reminder.status === 'active')
        .map((reminder) => ({
          ...reminder,
          scheduledLocal: localSchedule(reminder.scheduledAt, timezone),
        })),
      shoppingItems,
      persona: behavior
        ? {
            ...persona,
            traits: behavior.personality.traits,
            core: behavior.personality.guidance,
            behavior: { activePersonality: behavior.personality.id },
          }
        : persona,
      profile: profile ?? defaultProfile(userId, now),
      relationship: relationship ?? defaultRelationship(userId, selectedAssistantId, now),
      routine: routine ?? defaultRoutine(userId, now),
      people: people.slice(0, 20),
      runtime: { ...runtime, timezone },
      rinState: effectiveState,
      rinPreferences,
      rinWorldContext: usableWorld,
      worldSettings,
      rinEpisodes: rinEpisodes.slice(0, 20),
      recentProactiveMessages,
      recentReminderMessages,
      initiativeCue: {
        allowSpontaneousAside: Math.random() < 0.14,
        guidance:
          'If true, the assistant may naturally add one brief unsolicited aside, recommendation, opinion, or observation when it fits the conversation. Never force it and never derail a serious answer.',
      },
      longTermMemory: longTermMemory.slice(0, 20),
      workingMemory:
        workingMemory &&
        workingMemory.userId === userId &&
        workingMemory.conversationId === conversationId &&
        (workingMemory.assistantId ?? DEFAULT_ASSISTANT_ID) === selectedAssistantId &&
        workingMemory.expiresAt > Math.floor(Date.parse(runtime.currentTime) / 1000)
          ? workingMemory
          : null,
    };
  }
}

function personaFromAssistant(
  assistant: AssistantDefinition | null,
  fallback: Persona | null,
  userId: string,
  now: string,
): Persona | null {
  if (assistant?.persona) {
    return {
      userId,
      createdAt: now,
      updatedAt: now,
      name: assistant.name,
      traits: assistant.persona.traits,
      core: assistant.persona.core,
      behavior: assistant.persona.behavior,
    };
  }
  return fallback;
}
function defaultProfile(userId: string, now: string): UserProfile {
  return {
    userId,
    primaryLanguage: 'pt-BR',
    professionalLanguage: 'pt-BR',
    work: [],
    technology: [],
    workingStyle: [],
    defaultAssistantId: DEFAULT_ASSISTANT_ID,
    createdAt: now,
    updatedAt: now,
  };
}

function defaultRelationship(userId: string, assistantId: string, now: string): RelationshipConfig {
  return {
    userId,
    assistant: assistantId,
    relationship: [
      'New user: no shared history yet. Be warm and welcoming, learn preferences gradually.',
      'Never invent personal details about the user.',
    ],
    externalCommunication: [],
    createdAt: now,
    updatedAt: now,
  };
}

function defaultRoutine(userId: string, now: string): Routine {
  return {
    userId,
    weekdayPatterns: [],
    morningBriefing: [],
    endOfDay: [],
    createdAt: now,
    updatedAt: now,
  };
}

export type AgentContext = Awaited<ReturnType<AgentContextBuilder['build']>>;
