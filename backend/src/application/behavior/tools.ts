import { z } from 'zod';
import { defineTool } from '../agent/tools.js';
import { skillAssistant } from '../skills/scope.js';
import type { Clock } from '../ports/runtime.js';
import { BehaviorRuntime } from './runtime.js';

export function behaviorReadTools(runtime: BehaviorRuntime, clock: Clock) {
  const read = async (userId: string) =>
    runtime.get(userId, skillAssistant.getStore() ?? 'RIN', clock.now());
  return [
    defineTool({
      name: 'get_mood',
      description:
        'Read the current assistant mood score (0–10) derived from persisted state. Use when the user asks about the assistant mood. Energy and sleepiness are separate. This read never changes scores.',
      risk: 'READ',
      inputSchema: z.object({}).strict(),
      execute: async (_input, context) => {
        const snapshot = await read(context.userId);
        return snapshot
          ? {
              assistantId: snapshot.state.assistantId,
              score: snapshot.currentMoodScore ?? snapshot.state.moodScore,
              scale: { min: 0, max: 10 },
              personality: snapshot.personality.id,
            }
          : { available: false };
      },
    }),
    defineTool({
      name: 'get_relationship_state',
      description:
        'Read this user and assistant friendship/intimacy score (0–10) and selected personality from persisted state. Do not invent a score or change it. Scores govern reciprocal flirting, never access to help or ordinary conversation.',
      risk: 'READ',
      inputSchema: z.object({}).strict(),
      execute: async (_input, context) => {
        const snapshot = await read(context.userId);
        return snapshot
          ? {
              assistantId: snapshot.state.assistantId,
              intimacyScore: snapshot.state.intimacyScore,
              personality: snapshot.personality.id,
              scale: { min: 0, max: 10 },
            }
          : { available: false };
      },
    }),
  ];
}
