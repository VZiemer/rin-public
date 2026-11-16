import { expect, test } from 'vitest';
import { AssistantPreferences } from '../src/application/use-cases/assistant-preferences.js';
import { InMemoryAssistantRepository } from '../src/adapters/outbound/memory/assistant-repository.js';
import type { UserProfile } from '../src/domain/model/contracts.js';

test('reads and updates the user default assistant after validating it exists', async () => {
  const assistants = new InMemoryAssistantRepository();
  await assistants.put({
    id: 'RIN',
    name: 'Rin',
    description: 'Tsundere friend',
    defaultAvatarState: 'NEUTRAL',
    personaRef: 'rin',
    enabled: true,
  });
  await assistants.put({
    id: 'YUI',
    name: 'Yui',
    description: 'Cheerful companion',
    defaultAvatarState: 'SOFT_SMILE',
    personaRef: 'yui',
    enabled: true,
  });
  const profile: UserProfile = {
    userId: 'u',
    primaryLanguage: 'pt-BR',
    professionalLanguage: 'pt-BR',
    work: [],
    technology: [],
    workingStyle: [],
    createdAt: 'now',
    updatedAt: 'now',
  };
  const profiles = {
    get: async () => profile,
    put: async (value: UserProfile) => {
      Object.assign(profile, value);
      return true;
    },
  };
  const prefs = new AssistantPreferences(profiles, assistants);
  expect(await prefs.getDefault('u')).toBe('RIN');
  expect(await prefs.setDefault('u', 'yui')).toBe('YUI');
  expect(profile.defaultAssistantId).toBe('YUI');
  expect(await prefs.getDefault('u')).toBe('YUI');
  await expect(prefs.setDefault('u', 'NOPE')).rejects.toMatchObject({ code: 'ASSISTANT_NOT_FOUND' });
});
