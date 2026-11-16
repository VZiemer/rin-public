import type { SeedBundle } from './parser.js';
import type {
  PersonaRepository,
  UserProfileRepository,
  RelationshipRepository,
  RoutineRepository,
  PersonRepository,
} from '../../../application/ports/context.js';
import type { AssistantRepository } from '../../../application/ports/assistant.js';
export interface SeedRepositories {
  persona: PersonaRepository;
  profile: UserProfileRepository;
  relationship: RelationshipRepository;
  routine: RoutineRepository;
  people: PersonRepository;
  assistants?: AssistantRepository;
}
export async function seedContext(
  bundle: SeedBundle,
  repos: SeedRepositories,
  mode: 'insert-missing' | 'overwrite' = 'insert-missing',
) {
  const outcomes: boolean[] = [
    await repos.persona.put(bundle.persona, mode),
    await repos.profile.put(bundle.profile, mode),
    await repos.relationship.put(bundle.relationship, mode),
    await repos.routine.put(bundle.routine, mode),
  ];
  for (const relationship of bundle.assistantRelationships ?? []) {
    outcomes.push(await repos.relationship.put(relationship, mode));
  }
  for (const person of bundle.people) outcomes.push(await repos.people.put(person, mode));
  if (repos.assistants) {
    for (const assistant of bundle.assistants ?? []) {
      const existing = await repos.assistants.getById(assistant.id);
      if (existing && mode === 'insert-missing') {
        outcomes.push(false);
        continue;
      }
      await repos.assistants.put(assistant);
      outcomes.push(true);
    }
  }
  return { inserted: outcomes.filter(Boolean).length, skipped: outcomes.filter((v) => !v).length };
}
