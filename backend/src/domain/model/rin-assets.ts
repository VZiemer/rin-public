import { z } from 'zod';
import { androidAvatarStates } from './contracts.js';
import { assistantIdSchema } from './assistant-id.js';

export const assetIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/);
export const imageSelectionSchema = z.union([assetIdSchema, z.literal('')]);
export const rinAssetMoodSchema = z.enum([
  'happy',
  'playful',
  'neutral',
  'grumpy',
  'tired',
  'curious',
]);
export const rinAssetOccasionSchema = z.enum([
  'morning_briefing',
  'conversation',
  'message',
  'sync',
  'flirt',
]);
export type RinAssetMood = z.infer<typeof rinAssetMoodSchema>;
export type RinAssetOccasion = z.infer<typeof rinAssetOccasionSchema>;
const calendarDate = z.string().refine((value) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return z.iso.date().safeParse(value).success;
  if (!/^\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`2000-${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(5, 10) === value;
}, 'Use a valid MM-DD (annual) or YYYY-MM-DD date');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const rinAssetRulesSchema = z
  .object({
    dates: z.array(calendarDate).min(1).max(31).optional(),
    months: z.array(z.number().int().min(1).max(12)).min(1).max(12).optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    chance: z.number().min(0).max(1).optional(),
    moods: z.array(rinAssetMoodSchema).min(1).max(6).optional(),
    occasions: z.array(rinAssetOccasionSchema).min(1).max(5).optional(),
    weather: z.literal('SUNNY').optional(),
    timeWindow: z
      .object({ start: time, end: time })
      .strict()
      .refine(
        (value) => value.start !== value.end,
        'Equal hours are ambiguous; omit the window for all day',
      )
      .optional(),
  })
  .strict();
export const rinImageSchema = z
  .object({
    id: assetIdSchema,
    name: z.string().trim().min(1).max(120),
    expression: z.enum(androidAvatarStates),
    objectKey: z
      .string()
      .regex(/^assistants\/[A-Z][A-Z0-9]{1,15}\/[A-Za-z0-9/_.-]+\.(?:png|webp|jpg)$/)
      .refine((key) => !key.includes('..'))
      .max(512),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    contentType: z.enum(['image/png', 'image/webp', 'image/jpeg']),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(8 * 1024 * 1024),
  })
  .strict();
export const rinAssetSetSchema = z
  .object({
    id: assetIdSchema,
    name: z.string().trim().min(1).max(120),
    useCase: z.string().trim().min(1).max(500),
    enabled: z.boolean().default(true),
    manualOnly: z.boolean().optional(),
    priority: z.number().int().min(-1000).max(1000).default(0),
    rules: rinAssetRulesSchema.default({}),
    fallbackExpression: z.enum(androidAvatarStates).default('NEUTRAL'),
    images: z.array(rinImageSchema).min(1).max(androidAvatarStates.length),
  })
  .strict()
  .superRefine((set, context) => {
    if (new Set(set.images.map((image) => image.expression)).size !== set.images.length)
      context.addIssue({ code: 'custom', message: 'Expressions must be unique within a set' });
  });
export const rinAssetSetsSchema = z
  .array(rinAssetSetSchema)
  .max(30)
  .superRefine((sets, context) => {
    const images = sets.flatMap((set) => set.images);
    if (
      new Set(sets.map((set) => set.id)).size !== sets.length ||
      new Set(images.map((image) => image.id)).size !== images.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Set IDs and image IDs must be unique in the catalog',
      });
  });
export const publishRinAssetsSchema = z
  .object({
    operation: z.literal('publish'),
    assistantId: assistantIdSchema,
    version: assetIdSchema,
    expectedVersion: assetIdSchema.nullable(),
    sets: rinAssetSetsSchema,
  })
  .strict();
export const notifyRinAssetsSchema = z
  .object({
    operation: z.literal('notify'),
    assistantId: assistantIdSchema,
  })
  .strict();
export const rinAssetCatalogSchema = z.object({
  assistantId: assistantIdSchema,
  version: assetIdSchema,
  publishedAt: z.iso.datetime(),
  sets: rinAssetSetsSchema,
});
export type RinAssetImage = z.infer<typeof rinImageSchema>;
export type RinAssetSet = z.infer<typeof rinAssetSetSchema>;
export type RinAssetCatalog = z.infer<typeof rinAssetCatalogSchema>;
export const rinVisualAssetSchema = z
  .object({
    assistantId: assistantIdSchema,
    id: assetIdSchema,
    name: z.string().min(1).max(120),
    setId: assetIdSchema,
    expression: z.enum(androidAvatarStates),
    catalogVersion: assetIdSchema,
  })
  .strict();
export type RinVisualAsset = z.infer<typeof rinVisualAssetSchema>;
export const avatarImageAvailableSchema = z
  .object({
    type: z.literal('avatar_image_available'),
    assistantId: assistantIdSchema,
    imageName: assetIdSchema,
    imageUrl: z.url().refine((value) => value.startsWith('https://')),
    imageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const avatarImageSelectSchema = z
  .object({
    type: z.literal('avatar_image_select'),
    assistantId: assistantIdSchema,
    imageName: imageSelectionSchema,
  })
  .strict();
export const avatarImageCommandSchema = z.discriminatedUnion('type', [
  avatarImageAvailableSchema,
  avatarImageSelectSchema,
]);
export type AvatarImageCommand = z.infer<typeof avatarImageCommandSchema>;
export const selectRinAssetsSchema = z
  .object({
    operation: z.literal('select'),
    assistantId: assistantIdSchema,
    imageName: imageSelectionSchema,
  })
  .strict();
export const rinAssetsCommandSchema = z.discriminatedUnion('operation', [
  publishRinAssetsSchema,
  notifyRinAssetsSchema,
  selectRinAssetsSchema,
  z
    .object({
      operation: z.literal('sync'),
      assistantId: assistantIdSchema.optional(),
      force: z.boolean().default(false),
    })
    .strict(),
]);
