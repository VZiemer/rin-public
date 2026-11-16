import { parseDocument } from 'yaml';
import { z } from 'zod';
import type {
  Persona,
  RelationshipConfig,
  UserProfile,
  Routine,
  PersonRelationship,
} from '../../../domain/model/contracts.js';
import {
  assistantDefinitionSchema,
  type AssistantDefinition,
} from '../../../domain/model/assistant.js';
const strings = z.array(z.string().min(1));
const personality = z.object({
  name: z.string().min(1),
  traits: z.array(z.record(z.string(), z.number().min(0).max(1))),
  core: strings,
});
const relationship = z.object({ relationship: strings, external_communication: strings });
const profile = z.object({
  primary_language: z.string(),
  professional_language: z.string(),
  work: z.array(z.unknown()),
  technology: strings,
  working_style: strings,
});
const routine = z.object({
  weekday_patterns: strings,
  morning_briefing: strings,
  end_of_day: strings,
});
const people = z.object({
  people: z.array(
    z.object({
      id: z.string().regex(/^[\w-]+$/),
      name: z.string().min(1),
      relationship: z.string(),
      importance: z.enum(['HIGH', 'NORMAL']),
      guidance: strings,
    }),
  ),
});
const behavior = z.object({
  personality_intensity: z.array(z.record(z.string(), z.string())),
  must: strings,
  must_not: strings,
});
export interface SeedBundle {
  persona: Persona;
  relationship: RelationshipConfig;
  assistantRelationships: RelationshipConfig[];
  assistants: AssistantDefinition[];
  profile: UserProfile;
  routine: Routine;
  people: PersonRelationship[];
}
export function parseSeed(files: Record<string, string>, userId: string, now: string): SeedBundle {
  z.string()
    .regex(/^[\w-]+$/)
    .parse(userId);
  z.iso.datetime().parse(now);
  function read(name: string): unknown {
    const source = files[name];
    if (!source) throw new Error(`Missing seed: ${name}`);
    const doc = parseDocument(source, { uniqueKeys: true });
    if (doc.errors.length) throw new Error(`Invalid seed: ${name}`);
    return doc.toJS() as unknown;
  }
  const p = personality.parse(read('persona/personality.md'));
  const r = relationship.parse(read('persona/relationship.md'));
  const u = profile.parse(read('user-context/profile.md'));
  const rt = routine.parse(read('user-context/routine.md'));
  const persons = people.parse(read('user-context/relationships.md')).people;
  if (new Set(persons.map((p) => p.id)).size !== persons.length)
    throw new Error('Duplicate person IDs');
  const base = { userId, createdAt: now, updatedAt: now };
  return {
    persona: {
      ...base,
      name: p.name,
      traits: Object.assign({}, ...p.traits) as Record<string, number>,
      core: p.core,
      behavior: behavior.parse(read('persona/behavior-rules.md')),
    },
    relationship: {
      ...base,
      assistant: 'RIN',
      relationship: r.relationship,
      externalCommunication: r.external_communication,
    },
    assistantRelationships: [
      {
        ...base,
        assistant: 'YUI',
        relationship: relationship.parse(read('persona/yui-relationship.md')).relationship,
        externalCommunication: relationship.parse(read('persona/yui-relationship.md'))
          .external_communication,
      },
    ],
    assistants: [
      assistantDefinitionSchema.parse(read('assistants/rin.md')),
      assistantDefinitionSchema.parse(read('assistants/yui.md')),
    ],
    profile: {
      ...base,
      primaryLanguage: u.primary_language,
      professionalLanguage: u.professional_language,
      work: u.work,
      technology: u.technology,
      workingStyle: u.working_style,
    },
    routine: {
      ...base,
      weekdayPatterns: rt.weekday_patterns,
      morningBriefing: rt.morning_briefing,
      endOfDay: rt.end_of_day,
    },
    people: persons.map((p) => ({ ...base, ...p, name: p.name === '<FILL_IN>' ? null : p.name })),
  };
}
