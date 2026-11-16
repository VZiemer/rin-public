import { defaultAlertPreferences } from '../../domain/finance/alerts.js';
import { canApproach, type FollowUp } from '../../domain/skills/follow-up.js';
import type { SupportConsent } from '../../domain/skills/consent.js';
import { localDateTime } from '../agent/clock-zone.js';
import { planFinanceAlerts } from '../finance/alert-plan.js';
import type { AlertPreferenceRepository } from '../ports/alert-preferences.js';
import type { RinLiveStateRepository } from '../ports/context.js';
import type { DeviceRepository } from '../ports/device.js';
import type { FinanceRepository } from '../ports/finance.js';
import type { FollowUpRepository } from '../ports/follow-up.js';
import type { Logger } from '../ports/logger.js';
import type { NotificationGateway } from '../ports/notification.js';
import type { ReminderRepository } from '../ports/reminder.js';
import type { Clock } from '../ports/runtime.js';
import type { SkillThreadRepository } from '../ports/skill-thread.js';
import type { SupportConsentRepository } from '../ports/support-consent.js';
import type { RinInitiativeStore } from '../ports/tick.js';
import type { SkillEnablement } from '../skills/enablement.js';
import { SkillProactiveDispatcher } from '../skills/proactive-dispatch.js';
import {
  chooseInitiative,
  type InitiativeProposal,
  type ProactiveGate,
} from '../skills/proactive-engine.js';
import { deliverableDevices, deliverToDevices } from './push-delivery.js';
import {
  canAttempt,
  nextInitiativeAfterSend,
  normalizeInitiative,
  type ProactiveConfig,
} from './proactive-logic.js';

const ASSISTANT = 'RIN';
const LATER_MS = 3 * 60 * 60 * 1000;

export interface SkillAlertTickDeps {
  finance: FinanceRepository;
  preferences: AlertPreferenceRepository;
  followUps: FollowUpRepository;
  consents: SupportConsentRepository;
  threads: SkillThreadRepository;
  enablement: Pick<SkillEnablement, 'resolve'>;
  state: RinLiveStateRepository;
  initiative: RinInitiativeStore;
  reminders: ReminderRepository;
  devices: DeviceRepository;
  notifications: NotificationGateway;
  clock: Clock;
  config: ProactiveConfig;
  logger?: Logger;
}

/** Skill proposals share the existing schedule and Rin's global proactive budget. */
export class SkillAlertTick {
  constructor(private readonly deps: SkillAlertTickDeps) {}

  async execute(userId: string, event: unknown): Promise<Record<string, unknown>> {
    const now = this.deps.clock.now();
    const local = localDateTime(now, this.deps.config.timezone);
    const [
      state,
      threads,
      financeActivation,
      supportActivation,
      preferences,
      followUps,
      consents,
      reminders,
    ] = await Promise.all([
      this.deps.state.get(userId),
      this.deps.threads.listRecent(userId, ASSISTANT, 200),
      this.deps.enablement.resolve(userId, ASSISTANT, 'finance'),
      this.deps.enablement.resolve(userId, ASSISTANT, 'support'),
      this.deps.preferences.get(userId, ASSISTANT),
      this.deps.followUps.list(userId, ASSISTANT),
      this.deps.consents.list(userId, ASSISTANT),
      this.deps.reminders.list(userId, 200),
    ]);
    const raw = state?.initiative ?? {};
    const normalized = normalizeInitiative(raw, local.date, this.deps.config);
    const sent = threads.filter((thread) => thread.status === 'sent' && thread.sentAt);
    const sentToday = sent.filter(
      (thread) =>
        localDateTime(new Date(thread.sentAt!), this.deps.config.timezone).date === local.date,
    );
    const lastSentAt =
      [normalized.lastProactiveAt, ...sent.map((thread) => thread.sentAt)]
        .filter((at): at is string => typeof at === 'string')
        .sort()
        .at(-1) ?? null;
    const initiative = {
      ...normalized,
      messagesSentToday: Math.max(normalized.messagesSentToday, sentToday.length),
      lastProactiveAt: lastSentAt,
    };
    // A forced mood test must never bypass consent or delivery limits for skills.
    const allowed = canAttempt({ now, local, initiative, force: false });
    if (!allowed.allowed) return { decision: 'SILENT', reason: allowed.reason };

    const financePreferences = preferences ?? defaultAlertPreferences(userId, ASSISTANT, now);
    const financeToday = sentToday.filter((thread) => thread.skillId === 'finance').length;
    const financeAllowed =
      financeActivation.enabled &&
      financePreferences.enabled &&
      (!financePreferences.pausedUntil ||
        Date.parse(financePreferences.pausedUntil) <= now.getTime()) &&
      financeToday < financePreferences.maxPerDay;
    const pausedSkills: ProactiveGate['pausedSkills'] = [
      ...(!financeAllowed ? ['finance' as const] : []),
      ...(!supportActivation.enabled ? ['support' as const] : []),
    ];
    let proposals: InitiativeProposal[] = [];
    if (financeAllowed) {
      const [bills, budgets, entries] = await Promise.all([
        this.deps.finance.listBills(userId, ASSISTANT),
        this.deps.finance.listBudgets(userId, ASSISTANT),
        this.deps.finance.listEntries(userId, ASSISTANT),
      ]);
      proposals = planFinanceAlerts({
        userId,
        assistantId: ASSISTANT,
        bills,
        budgets,
        entries,
        preferences: financePreferences,
        now,
        localDate: local.date,
        alreadySentKeys: sent.map((thread) => thread.cooldownKey),
      });
    }
    proposals.push(
      ...planFollowUps(followUps, consents, now).filter(
        (proposal) => !pausedSkills.includes(proposal.skillId),
      ),
    );
    // Exact lookups keep deduplication working even after more than 200 threads.
    const pending = await Promise.all(
      proposals.map(async (proposal) => {
        const id = `${ASSISTANT}~${proposal.cooldownKey}`;
        const old = this.deps.threads.get
          ? await this.deps.threads.get(userId, ASSISTANT, id)
          : sent.find((thread) => thread.cooldownKey === proposal.cooldownKey);
        return old?.status === 'sent' ? null : { ...proposal, id };
      }),
    );
    proposals = pending.filter((proposal): proposal is InitiativeProposal => proposal !== null);
    if (proposals.length === 0)
      return { decision: 'SILENT', reason: 'no_skill_alert', allowMood: true };

    const reminderDueSoon = reminders.some((reminder) => {
      if (reminder.status !== 'active' || !reminder.scheduledAt) return false;
      const delta = Date.parse(reminder.scheduledAt) - now.getTime();
      return delta >= -5 * 60_000 && delta <= 15 * 60_000;
    });
    const gate: ProactiveGate = {
      now,
      localTime: local.time,
      quietStart: initiative.quietHours.start,
      quietEnd: initiative.quietHours.end,
      maxPerDay: initiative.maxMessagesPerDay,
      sentToday: initiative.messagesSentToday,
      pausedSkills,
      recentKeys: sent.map((thread) => ({ key: thread.cooldownKey, at: thread.sentAt! })),
      cooldownMs: initiative.minCooldownMinutes * 60_000,
      reminderDueSoon,
      moodCronSentToday: normalized.messagesSentToday > sentToday.length,
    };
    const eventRecord = record(event);
    const dryRun = Boolean(eventRecord.dryRun ?? record(eventRecord.detail).dryRun);
    if (dryRun) {
      const choice = chooseInitiative(proposals, gate);
      return {
        decision: choice.reason === 'selected' ? 'WOULD_SEND' : 'SILENT',
        reason: choice.reason,
      };
    }
    const devices = deliverableDevices(await this.deps.devices.list(userId, 20));
    if (devices.length === 0) return { decision: 'SILENT', reason: 'no_enabled_device' };
    let deliveredProposal: InitiativeProposal | undefined;
    const outcome = await new SkillProactiveDispatcher(
      this.deps.threads,
      this.deps.logger,
    ).dispatch(proposals, gate, async (proposal) => {
      // Recheck revocation/cancellation immediately before any external send.
      if (!(await this.deps.enablement.resolve(userId, ASSISTANT, proposal.skillId)).enabled)
        return false;
      const followUpId = proposal.factualContext.followUpId;
      if (typeof followUpId === 'string') {
        const followUp = await this.deps.followUps.get(userId, ASSISTANT, followUpId);
        if (!followUp || !canApproach(followUp, now)) return false;
        if (followUp.skillId === 'support') {
          if (!followUp.supportConsentId) return false;
          const consent = await this.deps.consents.get(
            userId,
            ASSISTANT,
            followUp.supportConsentId,
          );
          if (!validConsent(consent, followUp, now)) return false;
        }
      }
      const delivery = await deliverToDevices(
        devices,
        {
          message: proposal.text,
          avatarState: proposal.skillId === 'support' ? 'SOFT_SMILE' : 'FOCUSED',
          priority: proposal.priority,
          actions: [],
          assistantId: ASSISTANT,
        },
        this.deps.notifications,
        this.deps.devices,
        now,
      );
      if (delivery.delivered) deliveredProposal = proposal;
      return delivery.delivered;
    });
    if (outcome.status !== 'sent' || !deliveredProposal)
      return {
        decision: outcome.status === 'failed' ? 'FAILED' : 'SILENT',
        reason: outcome.reason,
      };

    const proposal = deliveredProposal;
    await this.deps.initiative.saveInitiative(
      userId,
      nextInitiativeAfterSend(
        raw,
        initiative,
        {
          type: 'SKILL_ALERT',
          topic: proposal.skillId,
          id: proposal.id,
          weight: proposal.relevance,
          data: {},
        },
        proposal.text,
        now,
        local.date,
      ),
      now,
    );
    const followUpId = proposal.factualContext.followUpId;
    if (typeof followUpId === 'string') {
      const latest = await this.deps.followUps.get(userId, ASSISTANT, followUpId);
      if (latest)
        await this.deps.followUps.put({
          ...latest,
          lastApproachAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
    }
    return { decision: 'SENT', reason: proposal.reasonCode, skillId: proposal.skillId };
  }
}

export function planFollowUps(
  followUps: readonly FollowUp[],
  consents: readonly SupportConsent[],
  now: Date,
): InitiativeProposal[] {
  return followUps.flatMap((followUp) => {
    if (!canApproach(followUp, now)) return [];
    const notBefore =
      followUp.windowStart ?? new Date(Date.parse(followUp.createdAt) + LATER_MS).toISOString();
    if (Date.parse(notBefore) > now.getTime()) return [];
    if (followUp.lastApproachAt && Date.parse(followUp.lastApproachAt) >= Date.parse(notBefore))
      return [];
    if (
      followUp.skillId === 'support' &&
      !validConsent(
        consents.find((consent) => consent.id === followUp.supportConsentId),
        followUp,
        now,
      )
    )
      return [];
    const cooldownKey = `followup:${followUp.id}:${notBefore}`;
    return [
      {
        id: cooldownKey,
        userId: followUp.userId,
        assistantId: followUp.assistantId,
        skillId: followUp.skillId,
        cooldownKey,
        relevance: 0.85,
        reasonCode: 'accepted_follow_up',
        factualContext: {
          followUpId: followUp.id,
          subject: followUp.subject,
          nextStep: followUp.nextStep,
        },
        text:
          followUp.skillId === 'support'
            ? 'Hi. We agreed to talk later. Would you like to talk now? No rush.'
            : 'We agreed to revisit a subject. Would you like to talk about it now?',
        notBefore,
        windowEnd: followUp.windowEnd,
        priority: 'NORMAL',
      },
    ];
  });
}

function validConsent(
  consent: SupportConsent | null | undefined,
  followUp: FollowUp,
  now: Date,
): boolean {
  return Boolean(
    consent &&
    consent.userId === followUp.userId &&
    consent.assistantId === followUp.assistantId &&
    consent.purpose === 'follow_up_push' &&
    consent.subject === followUp.subject &&
    consent.status === 'granted' &&
    Date.parse(consent.grantedAt) <= now.getTime() &&
    Date.parse(consent.expiresAt) > now.getTime(),
  );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
