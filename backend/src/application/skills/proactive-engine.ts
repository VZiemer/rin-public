import type { SkillId } from '../../domain/skills/definition.js';
import type { SubjectAnchor } from '../../domain/skills/subject.js';

export interface InitiativeProposal {
  id: string;
  userId: string;
  assistantId: string;
  skillId: SkillId;
  cooldownKey: string;
  relevance: number;
  reasonCode: string;
  factualContext: Record<string, string | number | boolean>;
  text: string;
  notBefore: string;
  windowEnd?: string | undefined;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
}

export interface SkillThread {
  id: string;
  userId: string;
  assistantId: string;
  skillId: InitiativeProposal['skillId'];
  cooldownKey: string;
  reasonCode: string;
  text: string;
  factualContext: Record<string, string | number | boolean>;
  status: 'proposed' | 'sent' | 'failed' | 'suppressed';
  sentAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ProactiveGate {
  now: Date;
  localTime: string;
  quietStart: string;
  quietEnd: string;
  maxPerDay: number;
  sentToday: number;
  pausedSkills: readonly SkillId[];
  recentKeys: readonly { key: string; at: string }[];
  cooldownMs: number;
  reminderDueSoon: boolean;
  moodCronSentToday: boolean;
}

export interface DispatchChoice {
  proposal: InitiativeProposal;
  reason:
    | 'selected'
    | 'quiet_hours'
    | 'reminder_priority'
    | 'cooldown'
    | 'daily_limit'
    | 'paused'
    | 'low_relevance'
    | 'none';
}

export function chooseInitiative(
  proposals: readonly InitiativeProposal[],
  gate: ProactiveGate,
): DispatchChoice {
  if (inQuietHours(gate.localTime, gate.quietStart, gate.quietEnd)) {
    return blocked(proposals[0], 'quiet_hours');
  }
  if (gate.reminderDueSoon) return blocked(proposals[0], 'reminder_priority');
  if (gate.sentToday >= gate.maxPerDay) return blocked(proposals[0], 'daily_limit');
  const open = proposals.filter(
    (proposal) =>
      !gate.pausedSkills.includes(proposal.skillId) &&
      Date.parse(proposal.notBefore) <= gate.now.getTime() &&
      (!proposal.windowEnd || Date.parse(proposal.windowEnd) >= gate.now.getTime()),
  );
  if (open.length === 0) return blocked(proposals[0], proposals.length === 0 ? 'none' : 'paused');
  const warm = open.filter((proposal) => !cooled(proposal, gate));
  if (warm.length === 0) return blocked(open[0], 'cooldown');
  const relevant = warm.filter((proposal) => !(gate.moodCronSentToday && proposal.relevance < 0.7));
  if (relevant.length === 0) return blocked(warm[0], 'low_relevance');
  const proposal = [...relevant].sort(
    (a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id),
  )[0];
  if (!proposal) return blocked(proposals[0], 'none');
  return { proposal, reason: 'selected' };
}

export function threadAnchors(threads: readonly SkillThread[]): SubjectAnchor[] {
  return threads.flatMap((thread) =>
    thread.status === 'sent' && thread.sentAt && thread.skillId !== 'conversation'
      ? [{ skillId: thread.skillId, ref: thread.id, at: thread.sentAt }]
      : [],
  );
}

export function inQuietHours(localTime: string, start: string, end: string): boolean {
  const current = minutes(localTime);
  const from = minutes(start);
  const to = minutes(end);
  if (from === to) return false;
  if (from < to) return current >= from && current < to;
  return current >= from || current < to;
}

function cooled(proposal: InitiativeProposal, gate: ProactiveGate): boolean {
  const recent = gate.recentKeys.find((item) => item.key === proposal.cooldownKey);
  if (!recent) return false;
  return gate.now.getTime() - Date.parse(recent.at) < gate.cooldownMs;
}

function blocked(
  proposal: InitiativeProposal | undefined,
  reason: DispatchChoice['reason'],
): DispatchChoice {
  if (!proposal) return { proposal: emptyProposal(), reason: 'none' };
  return { proposal, reason };
}

function emptyProposal(): InitiativeProposal {
  return {
    id: 'none',
    userId: '',
    assistantId: '',
    skillId: 'finance',
    cooldownKey: 'none',
    relevance: 0,
    reasonCode: 'none',
    factualContext: {},
    text: '',
    notBefore: '1970-01-01T00:00:00.000Z',
    priority: 'LOW',
  };
}

function minutes(value: string): number {
  const [hour, minute] = value.split(':');
  return Number(hour ?? 0) * 60 + Number(minute ?? 0);
}
