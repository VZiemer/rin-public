import { z } from 'zod';
import { assistantIdSchema } from './assistant-id.js';
import { assetIdSchema } from './rin-assets.js';

export const personalityIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,47}$/);
export const behaviorScoreSchema = z.number().finite().min(0).max(10);
export const socialLevelSchema = z.number().finite().int().min(0).max(100);
export const socialConfigSchema = z
  .object({
    familiarity: socialLevelSchema,
    profanityLevel: socialLevelSchema,
    humorLevel: socialLevelSchema,
    // Omitted dimensions follow humorLevel, so the three-knob configuration remains sufficient.
    sarcasmLevel: socialLevelSchema.optional(),
    darkHumorLevel: socialLevelSchema.optional(),
    teasingLevel: socialLevelSchema.optional(),
  })
  .strict();
export type SocialConfig = z.infer<typeof socialConfigSchema>;
export const personalityDefinitionSchema = z
  .object({
    id: personalityIdSchema,
    name: z.string().min(1).max(80),
    version: z.number().int().positive(),
    enabled: z.boolean(),
    traits: z.record(z.string(), z.number().min(0).max(1)),
    guidance: z.array(z.string().min(1).max(1600)).min(1).max(16),
  })
  .strict();
export type PersonalityDefinition = z.infer<typeof personalityDefinitionSchema>;

export const assistantBehaviorSchema = z
  .object({
    // Matches existing owned entities, including local dev IDs; admin CLI still requires a UUID.
    userId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    assistantId: assistantIdSchema,
    personalityId: personalityIdSchema,
    moodScore: behaviorScoreSchema,
    intimacyScore: behaviorScoreSchema,
    diagnosticsEnabled: z.boolean(),
    // Absence preserves the existing personality and delivery; this never changes relationship scores.
    socialConfig: socialConfigSchema.optional(),
    // Accepted for compatibility with the earlier fixed-selection implementation; ignored at runtime.
    manualImageName: assetIdSchema.optional(),
    evolutionEnabled: z.boolean().default(true),
    lastManualChangeAt: z.iso.datetime().optional(),
    moodAnchorAt: z.iso.datetime().optional(),
    dynamics: z
      .object({
        day: z.iso.date(),
        moodGain: z.number().nonnegative(),
        moodLoss: z.number().nonnegative(),
        intimacyGain: z.number().nonnegative(),
        intimacyLoss: z.number().nonnegative(),
        lastMoodAt: z.iso.datetime().optional(),
        lastIntimacyAt: z.iso.datetime().optional(),
        lastEventAt: z.iso.datetime().optional(),
      })
      .strict()
      .optional(),
    version: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type AssistantBehavior = z.infer<typeof assistantBehaviorSchema>;
export interface BehaviorSnapshot {
  state: AssistantBehavior;
  personality: PersonalityDefinition;
  currentMoodScore?: number;
}
export function defaultAssistantBehavior(
  userId: string,
  assistantId: string,
  now: Date,
  personalityId = 'tsundere',
): AssistantBehavior {
  return assistantBehaviorSchema.parse({
    userId,
    assistantId,
    personalityId,
    moodScore: 5,
    intimacyScore: 3,
    diagnosticsEnabled: false,
    version: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}
