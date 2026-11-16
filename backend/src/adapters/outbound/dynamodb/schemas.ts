import { z } from 'zod';
export const owned = z.object({
  userId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const strings = z.array(z.string());
export const personaSchema = owned
  .extend({
    name: z.string(),
    traits: z.record(z.string(), z.number()),
    core: strings,
    behavior: z.record(z.string(), z.unknown()),
  })
  .passthrough();
export const profileSchema = owned
  .extend({
    grammaticalGender: z.enum(['masculine', 'feminine', 'neutral']).optional(),
    primaryLanguage: z.string(),
    professionalLanguage: z.string(),
    work: z.array(z.unknown()),
    technology: strings,
    workingStyle: strings,
    defaultAssistantId: z.string().optional(),
  })
  .passthrough();
export const relationshipSchema = owned
  .extend({
    relationship: strings,
    externalCommunication: strings,
    guidance: strings.optional(),
    boundaries: z.record(z.string(), z.unknown()).optional(),
    relationshipType: z.string().optional(),
    assistant: z.string().optional(),
  })
  .passthrough();
export const routineSchema = owned
  .extend({
    weekdayPatterns: strings,
    morningBriefing: strings,
    endOfDay: strings,
  })
  .passthrough();
export const rinLiveStateSchema = owned
  .extend({
    mood: z.record(z.string(), z.unknown()).default({}),
    currentInterests: strings.optional(),
    currentThoughts: strings.optional(),
    currentActivities: strings.optional(),
    todayEvents: strings.optional(),
    initiative: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export const rinPreferencesSchema = owned
  .extend({
    likes: z.array(z.unknown()).optional(),
    dislikes: z.array(z.unknown()).optional(),
    hobbies: strings.optional(),
    recommendationTopics: strings.optional(),
    tastes: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export const rinWorldContextSchema = owned
  .extend({
    weather: z.unknown().optional(),
    news: z.unknown().optional(),
    dailyDigest: z.unknown().optional(),
    notableEvents: z.array(z.unknown()).optional(),
    capturedAt: z.string().optional(),
    validUntil: z.string().optional(),
  })
  .passthrough();
export const rinEpisodeSchema = owned
  .extend({
    id: z.string(),
    type: z.string(),
    summary: z.string().min(1).max(4000),
    importance: z.number().min(0).max(1).optional(),
    emotionalTone: z.string().optional(),
    happenedAt: z.string().optional(),
    tags: strings.optional(),
  })
  .passthrough();
export const shoppingItemSchema = owned.extend({
  id: z.string().regex(/^[\w-]+$/),
  name: z.string().trim().min(1).max(200),
  normalizedName: z.string().trim().min(1).max(200),
});
export const personSchema = owned.extend({
  id: z.string(),
  name: z.string().nullable(),
  relationship: z.string(),
  importance: z.enum(['HIGH', 'NORMAL']),
  guidance: strings,
});
