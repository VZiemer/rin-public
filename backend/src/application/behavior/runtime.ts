import type { RinLiveState } from '../../domain/model/contracts.js';
import {
  defaultAssistantBehavior,
  type BehaviorSnapshot,
} from '../../domain/model/assistant-behavior.js';
import type {
  AssistantBehaviorRepository,
  PersonalityRepository,
} from '../ports/assistant-behavior.js';
import { AppError } from '../../domain/errors/app-error.js';
import { moodScoreAt } from '../../domain/model/behavior-evolution.js';
import type { AssistantRepository } from '../ports/assistant.js';

export class BehaviorRuntime {
  constructor(
    readonly states: AssistantBehaviorRepository,
    readonly personalities: PersonalityRepository,
    private assistants?: AssistantRepository,
  ) {}
  async get(userId: string, assistantId: string, now: Date): Promise<BehaviorSnapshot | null> {
    const stored = await this.states.get(userId, assistantId);
    const defaultPersonalityId = !stored
      ? (await this.assistants?.getById(assistantId))?.defaultPersonalityId
      : undefined;
    if (!stored && !defaultPersonalityId && assistantId !== 'RIN') return null;
    const state =
      stored ??
      defaultAssistantBehavior(userId, assistantId, now, defaultPersonalityId ?? 'tsundere');
    const personality = await this.personalities.get(state.personalityId);
    if (!personality?.enabled) throw new AppError('personality_unavailable', 503);
    return { state, personality, currentMoodScore: moodScoreAt(state, now) };
  }
}

/** Only the base score is persisted. Weather and the night window stay read-time overlays. */
export function applyBehaviorMood(
  state: RinLiveState | null,
  snapshot:
    (Pick<BehaviorSnapshot, 'state'> & Partial<Pick<BehaviorSnapshot, 'currentMoodScore'>>) | null,
): RinLiveState | null {
  if (!snapshot) return state;
  const score = snapshot.currentMoodScore ?? snapshot.state.moodScore;
  const base = state ?? {
    userId: snapshot.state.userId,
    createdAt: snapshot.state.createdAt,
    updatedAt: snapshot.state.updatedAt,
    mood: {},
  };
  return {
    ...base,
    mood: {
      ...base.mood,
      score,
      primary: score <= 3 ? 'GRUMPY' : score >= 7 ? 'HAPPY' : 'NEUTRAL',
      patience: 20 + score * 8,
      irritability: 100 - score * 10,
    },
  };
}
