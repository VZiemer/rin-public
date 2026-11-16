import type {
  InteractionAssessment,
  InteractionEvent,
  EvolutionDecision,
} from '../../domain/model/behavior-evolution.js';

export interface InteractionClassifier {
  assess(event: InteractionEvent): Promise<InteractionAssessment>;
}
export interface InteractionDispatcher {
  dispatch(event: InteractionEvent): Promise<void>;
}
export interface EvolutionReceipt {
  eventId: string;
  fingerprint: string;
  day: string;
  decision: string;
  moodDelta: number;
  intimacyDelta: number;
  createdAt: string;
}
export interface BehaviorEvolutionRepository {
  fingerprint(message: string): string;
  seen(event: InteractionEvent, day: string, fingerprint: string): Promise<boolean>;
  commit(
    event: InteractionEvent,
    day: string,
    fingerprint: string,
    assessment: InteractionAssessment,
    decision: EvolutionDecision,
    expectedVersion: number | null,
    now: Date,
  ): Promise<'committed' | 'duplicate' | 'conflict'>;
}
