import { z } from 'zod';
import { androidAvatarStates } from './contracts.js';
import { rinVisualAssetSchema, imageSelectionSchema } from './rin-assets.js';
import { assistantIdSchema, DEFAULT_ASSISTANT_ID } from './assistant-id.js';
const avatarAliases: Record<string, (typeof androidAvatarStates)[number]> = {
  neutral: 'NEUTRAL',
  scolding: 'SCOLDING',
  smug: 'SMUG',
  embarrassed: 'EMBARRASSED',
  angry_pout: 'ANGRY_POUT',
  surprised: 'SURPRISED',
  soft_smile: 'SOFT_SMILE',
  focused: 'FOCUSED',
  tired: 'TIRED',
  idle: 'NEUTRAL',
  thinking: 'FOCUSED',
  happy: 'SOFT_SMILE',
  concerned: 'SCOLDING',
  serious: 'FOCUSED',
};
export const avatarStateSchema = z
  .string()
  .transform((value) => avatarAliases[value.toLowerCase()] ?? value.toUpperCase())
  .pipe(z.enum(androidAvatarStates))
  .catch('NEUTRAL');
export const prioritySchema = z
  .string()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']))
  .catch('NORMAL');
export const androidLocalActionSchema = z
  .object({
    type: z.literal('LOCAL_TOOL'),
    tool: z.enum(['focus.start', 'device.set_alarm', 'device.open_alarms']),
    payload: z.record(z.string(), z.unknown()).default({}),
    requiresConfirmation: z.boolean().optional(),
  })
  .strict();
export const confirmationActionSchema = z
  .object({
    type: z.literal('CONFIRMATION'),
    label: z.string().min(1),
    confirmationId: z.string().min(1),
  })
  .strict();
export const agentOutputSchema = z
  .object({
    imageName: imageSelectionSchema.nullable().optional(),
    visualAsset: rinVisualAssetSchema.optional(),
    message: z.string().min(1).max(8000),
    avatarState: avatarStateSchema,
    priority: prioritySchema,
    assistantId: assistantIdSchema.optional().default(DEFAULT_ASSISTANT_ID),
    actions: z
      .array(
        z.union([
          androidLocalActionSchema,
          confirmationActionSchema,
          z
            .object({
              type: z.literal('confirmation'),
              label: z.string().min(1),
              confirmationId: z.string().min(1),
            })
            .strict()
            .transform((value) => ({
              type: 'CONFIRMATION' as const,
              label: value.label,
              confirmationId: value.confirmationId,
            })),
        ]),
      )
      .max(20),
  })
  .strict();
export const toolCallSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    input: z.unknown(),
  })
  .strict();
export const modelResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('final'), output: agentOutputSchema }),
  z.object({ type: z.literal('tool_call'), call: toolCallSchema }),
  z.object({
    type: z.literal('tool_calls'),
    calls: z.array(toolCallSchema).min(1).max(10),
  }),
]);
