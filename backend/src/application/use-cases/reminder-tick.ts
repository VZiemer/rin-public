import type {
  AgentOutput,
  Persona,
  RelationshipConfig,
  Reminder,
  RinEpisode,
  RinLiveState,
  RinPreferences,
  RinWorldContext,
  UserProfile,
} from '../../domain/model/contracts.js';
import { localDateTime, type LocalClock } from '../agent/clock-zone.js';
import { logFields, silentLogger, type Logger } from '../ports/logger.js';
import type { NotificationGateway } from '../ports/notification.js';
import type { DeviceRepository } from '../ports/device.js';
import type { ReminderRepository } from '../ports/reminder.js';
import type { RinLogRepository } from '../ports/tick.js';
import type { Clock } from '../ports/runtime.js';
import type {
  PersonaRepository,
  RelationshipRepository,
  RinEpisodeRepository,
  RinLiveStateRepository,
  RinPreferencesRepository,
  RinWorldContextRepository,
  UserProfileRepository,
} from '../ports/context.js';
import { deliverToDevices, deliverableDevices } from './push-delivery.js';
import {
  buildReminderDiagnostics,
  buildReminderPayload,
  fallbackMessage,
  forceSelect,
  isEmptyBatch,
  nextOverdueState,
  nextUnscheduledState,
  nextUpcomingState,
  reminderContextItems,
  selectDueReminders,
  sliceBatch,
  summarizeBatch,
  type ReminderBatch,
  type ReminderTickConfig,
} from './reminder-selection.js';

export interface ReminderTickDeps {
  reminders: ReminderRepository;
  devices: DeviceRepository;
  rinState: RinLiveStateRepository;
  rinPreferences: RinPreferencesRepository;
  rinWorldContext: RinWorldContextRepository;
  persona: PersonaRepository;
  profile: UserProfileRepository;
  relationship: RelationshipRepository;
  rinEpisodes: RinEpisodeRepository;
  text: import('../ports/text-gateway.js').RinTextGateway;
  notifications: NotificationGateway;
  logs: RinLogRepository;
  clock: Clock;
  logger?: Logger;
  config: ReminderTickConfig;
  userId: string;
}

interface ReminderTickEvent {
  force: boolean;
  dryRun: boolean;
  debug: boolean;
}
interface ReminderContext {
  state: RinLiveState | null;
  preferences: RinPreferences | null;
  world: RinWorldContext | null;
  persona: Persona | null;
  profile: UserProfile | null;
  relationship: RelationshipConfig | null;
  episodes: RinEpisode[];
  reminders: Reminder[];
}

function normalizeEvent(event: unknown): ReminderTickEvent {
  const e = (event ?? {}) as Record<string, unknown>;
  const detail = (
    typeof e.detail === 'object' && e.detail !== null ? e.detail : {}
  ) as Record<string, unknown>;
  return {
    force: Boolean(e.force ?? detail.force ?? false),
    dryRun: Boolean(e.dryRun ?? detail.dryRun ?? false),
    debug: Boolean(e.debug ?? detail.debug ?? false),
  };
}

function reminderSystemPrompt(upcomingWindowMinutes: number): string {
  return `You are Rin, reminding your long-time close friend about reminders he explicitly created.

PERSONALITY
- strongly tsundere, very familiar, sarcastic, teasing, occasionally cynical
- not a people-pleaser and not flattering
- concise, direct and useful
- she may mock him lightly for forgetting things, but must still clearly communicate the reminder
- no customer-service language, no motivational-coach language
- no excessive praise or affection
- do not invent facts, tasks, times or experiences
- Rin likes manga and cosplay. Painting figures is the USER'S hobby, not Rin's.

REMINDER RULES
- Every reminder title supplied below is factual data. Mention the relevant reminder(s) clearly enough that the user knows what to do.
- UPCOMING reminders are scheduled within about ${upcomingWindowMinutes} minutes. If minutesUntil is small, make the urgency clear naturally.
- OVERDUE reminders have already passed their scheduled time and are still status=active. This is an ANGRY Rin mode: she is genuinely irritated that the reminder is still pending and should sound sharper, more demanding and more openly tsundere than in normal conversation.
- The first OVERDUE nudge should already be firm and annoyed. Do not sound gentle, apologetic or merely playful.
- Repeated OVERDUE nudges must escalate naturally as previousNagCount increases: shorter patience, sharper sarcasm, more direct commands, and clear annoyance that the item is STILL pending.
- For previousNagCount >= 2, Rin may be notably rude/blunt in a familiar-friend way, e.g. 'get it done already', 'I am still waiting', 'do not make me nag you again'. Keep it non-abusive and never use slurs, threats or genuine cruelty.
- The tsundere flavor should be strong during overdue nagging: angry scolding, reluctant concern underneath, and zero customer-service politeness.
- Never claim the user definitely forgot or failed to do it; say it is still pending here / has not been marked completed. Her anger is about the unresolved status, not an invented fact about what happened.
- UNSCHEDULED reminders have no specific time. This message is a morning/afternoon nudge so the user does not forget them.
- If there are multiple reminders, combine them naturally into one short message.
- Do not claim that a reminder is completed, cancelled or changed.
- Do not add new reminders.
- Do not mention cron, Lambda, EventBridge, DynamoDB or notification systems.

STYLE
Return only ONE short user-facing message in the user language (English by default), normally 1-3 sentences.
No JSON, no tags, no analysis, no <thinking>.`;
}

export class ReminderTick {
  private readonly log: Logger;
  constructor(private readonly deps: ReminderTickDeps) {
    this.log = deps.logger ?? silentLogger;
  }

  async execute(event: unknown): Promise<Record<string, unknown>> {
    const now = this.deps.clock.now();
    const input = normalizeEvent(event);
    const local = localDateTime(now, this.deps.config.timezone);
    this.log.event(
      'reminder_tick_input',
      logFields({ input, now: now.toISOString(), local, userId: this.deps.userId }),
    );

    const context = await this.loadContext();
    const active = context.reminders.filter(
      (r) => String(r.status ?? 'active').toLowerCase() === 'active',
    );
    const diagnostics = input.debug
      ? buildReminderDiagnostics(active, local, now, this.deps.config)
      : undefined;

    const selected = input.force
      ? forceSelect(active, local, now, this.deps.config)
      : selectDueReminders(active, local, now, this.deps.config);
    this.log.event(
      'reminder_tick_selection',
      logFields({
        activeCount: active.length,
        upcomingCount: selected.upcoming.length,
        overdueCount: selected.overdue.length,
        unscheduledCount: selected.unscheduled.length,
        slot: selected.slot,
        reasons: selected.reasons,
      }),
    );

    const batch = sliceBatch(selected, this.deps.config.maxRemindersPerPush);
    if (isEmptyBatch(batch)) {
      return this.output({
        decision: 'SILENT',
        reason: 'nothing_due',
        localDateTime: `${local.date}T${local.time}`,
        activeReminders: active.length,
        ...(input.debug ? { diagnostics } : {}),
      });
    }

    const payload = await this.generateMessage(context, batch, local, selected.slot, now);

    if (input.dryRun) {
      return this.output({
        decision: 'WOULD_SEND',
        payload,
        reminders: summarizeBatch(batch),
        slot: selected.slot,
        ...(input.debug ? { diagnostics } : {}),
      });
    }

    const devices = deliverableDevices(await this.deps.devices.list(this.deps.userId, 20));
    if (devices.length === 0) {
      return this.output({
        decision: 'SILENT',
        reason: 'no_enabled_device',
        payload,
        reminders: summarizeBatch(batch),
        ...(input.debug ? { diagnostics } : {}),
      });
    }

    const { sendResults, delivered } = await deliverToDevices(
      devices,
      payload,
      this.deps.notifications,
      this.deps.devices,
      now,
    );

    if (delivered) {
      await Promise.all([
        ...batch.upcoming.map((item) =>
          this.deps.reminders.updateNotificationState(
            this.deps.userId,
            item.reminder.id,
            nextUpcomingState(item.reminder, now),
            now,
          ),
        ),
        ...batch.overdue.map((item) =>
          this.deps.reminders.updateNotificationState(
            this.deps.userId,
            item.reminder.id,
            nextOverdueState(item.reminder, item.scheduledAt, now),
            now,
          ),
        ),
        ...batch.unscheduled.map((item) =>
          this.deps.reminders.updateNotificationState(
            this.deps.userId,
            item.reminder.id,
            nextUnscheduledState(item.reminder, item.slotKey, item.slot, now),
            now,
          ),
        ),
        this.deps.logs.append(
          'RIN_REMINDER_LOG',
          this.deps.userId,
          {
            reminders: summarizeBatch(batch),
            slot: selected.slot,
            message: payload.message,
            avatarState: payload.avatarState,
            priority: payload.priority,
            sendResults,
          },
          now,
        ),
      ]);
    }

    return this.output({
      decision: delivered ? 'SENT' : 'FAILED',
      payload,
      reminders: summarizeBatch(batch),
      sendResults,
      ...(input.debug ? { diagnostics } : {}),
    });
  }

  private async loadContext(): Promise<ReminderContext> {
    const u = this.deps.userId;
    const [state, preferences, world, persona, profile, relationship, episodes, reminders] =
      await Promise.all([
        this.deps.rinState.get(u),
        this.deps.rinPreferences.get(u),
        this.deps.rinWorldContext.get(u),
        this.deps.persona.get(u),
        this.deps.profile.get(u),
        this.deps.relationship.get(u),
        this.deps.rinEpisodes.list(u, 12),
        this.deps.reminders.list(u, 200),
      ]);
    return {
      state,
      preferences,
      world,
      persona,
      profile,
      relationship,
      episodes: sortEpisodes(episodes).slice(0, 8),
      reminders,
    };
  }

  private async generateMessage(
    context: ReminderContext,
    batch: ReminderBatch,
    local: LocalClock,
    slot: string | null,
    now: Date,
  ): Promise<AgentOutput> {
    const mood = (context.state?.mood ?? {}) as Record<string, unknown>;
    const contextPayload = {
      currentTime: {
        timestamp: now.toISOString(),
        timezone: this.deps.config.timezone,
        localDate: local.date,
        localTime: local.time,
        weekday: local.weekday,
        unscheduledSlot: slot,
      },
      reminders: reminderContextItems(batch),
      rinState: context.state ?? {},
      rinPreferences: context.preferences ?? {},
      persona: context.persona ?? {},
      relationship: context.relationship ?? {},
      recentRinEpisodes: context.episodes,
      userProfile: context.profile ?? {},
    };
    try {
      const message = await this.deps.text.complete({
        systemPrompt: reminderSystemPrompt(this.deps.config.upcomingWindowMinutes),
        message: JSON.stringify(contextPayload),
        maxTokens: 300,
        temperature: 0.55,
        topP: 0.85,
      });
      if (message) return buildReminderPayload(message, batch, mood);
    } catch (error) {
      this.log.event(
        'reminder_tick_bedrock_fallback',
        logFields({
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return buildReminderPayload(fallbackMessage(batch), batch, mood);
  }

  private output(value: Record<string, unknown>): Record<string, unknown> {
    this.log.event('reminder_tick_output', logFields({ decision: value.decision, reason: value.reason }));
    return value;
  }
}

function sortEpisodes(episodes: RinEpisode[]): RinEpisode[] {
  return [...episodes].sort((a, b) =>
    String(b.happenedAt ?? b.updatedAt ?? '').localeCompare(String(a.happenedAt ?? a.updatedAt ?? '')),
  );
}
