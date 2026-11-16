import { z } from 'zod';
import { assistantIdSchema, type AssistantId } from './assistant-id.js';
import { androidAvatarStates, type RinState } from './contracts.js';
import { personalityIdSchema } from './assistant-behavior.js';

export const assistantCapabilitiesSchema = z
  .object({
    proactive: z.boolean().optional(),
    reminders: z.boolean().optional(),
    shopping: z.boolean().optional(),
  })
  .strict();

export const assistantPersonaSchema = z
  .object({
    traits: z.record(z.string(), z.number()),
    core: z.array(z.string()),
    behavior: z.record(z.string(), z.unknown()),
  })
  .strict();

export const assistantDefinitionSchema = z
  .object({
    id: assistantIdSchema,
    name: z.string().trim().min(1).max(64),
    description: z.string().trim().min(1).max(500),
    defaultAvatarState: z.enum(androidAvatarStates),
    personaRef: z.string().trim().min(1).max(128),
    defaultPersonalityId: personalityIdSchema.optional(),
    enabled: z.boolean().default(true),
    persona: assistantPersonaSchema.optional(),
    capabilities: assistantCapabilitiesSchema.optional(),
  })
  .strict()
  .refine((value) => !('android' in value) && !('drawable' in value) && !('resourceId' in value), {
    message: 'Assistant definition must stay provider-neutral',
  });

export type AssistantCapabilities = z.infer<typeof assistantCapabilitiesSchema>;
export type AssistantPersona = z.infer<typeof assistantPersonaSchema>;
export type AssistantDefinition = Omit<z.infer<typeof assistantDefinitionSchema>, 'id'> & {
  id: AssistantId;
  defaultAvatarState: RinState;
};
