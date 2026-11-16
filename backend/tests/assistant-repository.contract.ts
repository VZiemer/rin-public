import { expect, test } from 'vitest';
import type { AssistantDefinition } from '../src/domain/model/assistant.js';
import type { AssistantRepository } from '../src/application/ports/assistant.js';

const rin: AssistantDefinition = {
  id: 'RIN',
  name: 'Rin',
  description: 'Tsundere friend',
  defaultAvatarState: 'NEUTRAL',
  personaRef: 'rin-persona',
  enabled: true,
};

const yui: AssistantDefinition = {
  id: 'YUI',
  name: 'Yui',
  description: 'Cheerful companion',
  defaultAvatarState: 'SOFT_SMILE',
  personaRef: 'yui-persona',
  enabled: true,
};

export function assistantRepositoryContract(create: () => AssistantRepository) {
  test('stores and loads assistants independently from users', async () => {
    const repo = create();
    await repo.put(rin);
    await repo.put(yui);
    expect(await repo.getById('rin')).toEqual(rin);
    expect(await repo.getById('YUI')).toEqual(yui);
    expect((await repo.listAvailable()).map((item) => item.id).sort()).toEqual(['RIN', 'YUI']);
  });

  test('hides disabled assistants from listAvailable', async () => {
    const repo = create();
    await repo.put({ ...yui, enabled: false });
    expect(await repo.getById('YUI')).toEqual({ ...yui, enabled: false });
    expect(await repo.listAvailable()).toEqual([]);
  });

  test('returns null for unknown or invalid assistant ids', async () => {
    const repo = create();
    expect(await repo.getById('NOPE')).toBeNull();
    expect(await repo.getById('USER#dev-user')).toBeNull();
  });
}
