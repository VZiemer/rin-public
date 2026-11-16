import { z } from 'zod';
import { userIdSchema } from './user-id.js';
import { androidAvatarStates } from './contracts.js';
import { assetIdSchema, rinImageSchema, rinAssetRulesSchema } from './rin-assets.js';

export const assetUsageSchema = z
  .object({
    useCase: z.string().trim().min(1).max(500),
    rules: rinAssetRulesSchema,
    manualOnly: z.boolean().optional(),
    priority: z.number().int().min(-1000).max(1000),
    expression: z.enum(androidAvatarStates),
  })
  .strict();
export const assetUsageDecisionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('understood'), usage: assetUsageSchema }).strict(),
  z.object({ status: z.literal('clarify'), question: z.string().trim().min(1).max(500) }).strict(),
  z.object({ status: z.literal('unrelated') }).strict(),
]);
export const assetOnboardingSchema = z
  .object({
    userId: userIdSchema,
    assistantId: z.literal('RIN'),
    image: rinImageSchema,
    status: z.enum(['pending', 'ready', 'completed']),
    revision: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    deliveredDevices: z.array(z.string().max(300)).max(200),
    turns: z
      .array(
        z
          .object({
            answer: z.string().max(2000),
            question: z.string().max(500),
          })
          .strict(),
      )
      .max(20),
    usage: assetUsageSchema.optional(),
    catalogVersion: assetIdSchema.optional(),
  })
  .strict();
export type AssetOnboarding = z.infer<typeof assetOnboardingSchema>;
export type AssetUsageDecision = z.infer<typeof assetUsageDecisionSchema>;
export function assetContextQuestion(imageName: string) {
  return `I received the image "${imageName}". When should I use it? Specify the occasion and, if applicable, times, dates or mood.`;
}
