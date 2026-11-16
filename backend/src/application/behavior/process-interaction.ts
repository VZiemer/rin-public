import {
  evolveBehavior,
  interactionAssessmentSchema,
  interactionEventSchema,
  protectedInteraction,
} from '../../domain/model/behavior-evolution.js';
import type {
  BehaviorEvolutionRepository,
  InteractionClassifier,
} from '../ports/behavior-evolution.js';
import type { Clock } from '../ports/runtime.js';
import { localDateOf } from '../agent/local-time.js';
import { BehaviorRuntime } from './runtime.js';
import { AppError } from '../../domain/errors/app-error.js';

export class ProcessBehaviorInteraction {
  constructor(
    private runtime: BehaviorRuntime,
    private events: BehaviorEvolutionRepository,
    private classifier: InteractionClassifier,
    private clock: Clock,
  ) {}
  async execute(input: unknown) {
    const event = interactionEventSchema.parse(input);
    const now = this.clock.now();
    const age = now.getTime() - Date.parse(event.occurredAt);
    if (age < -300000 || age > 3600000) return { status: 'ignored', reason: 'expired' };
    if (protectedInteraction(event.message)) return { status: 'ignored', reason: 'protected' };
    const day = localDateOf(event.occurredAt, event.timezone);
    const fingerprint = this.events.fingerprint(event.message);
    if (await this.events.seen(event, day, fingerprint))
      return { status: 'ignored', reason: 'duplicate' };
    const initial = await this.runtime.get(event.userId, event.assistantId, now);
    if (!initial?.state.evolutionEnabled)
      return { status: 'ignored', reason: 'disabled_or_unconfigured' };
    if (initial.state.lastManualChangeAt && event.occurredAt <= initial.state.lastManualChangeAt)
      return { status: 'ignored', reason: 'manual_override' };
    const assessment = interactionAssessmentSchema.parse(await this.classifier.assess(event));
    for (let attempt = 0; attempt < 3; attempt++) {
      const stored = await this.runtime.states.get(event.userId, event.assistantId);
      const current = stored ?? initial.state;
      const decision = evolveBehavior(current, event, assessment, this.clock.now(), day);
      const result = await this.events.commit(
        event,
        day,
        fingerprint,
        assessment,
        decision,
        stored?.version ?? null,
        this.clock.now(),
      );
      if (result === 'duplicate') return { status: 'ignored', reason: 'duplicate' };
      if (result === 'committed')
        return {
          status: decision.state ? 'applied' : 'unchanged',
          reason: decision.reason,
          moodDelta: decision.moodDelta,
          intimacyDelta: decision.intimacyDelta,
        };
    }
    throw new AppError('behavior_conflict', 409);
  }
}
