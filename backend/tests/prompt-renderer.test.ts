import { expect, test, vi } from 'vitest';
import { AgentContextBuilder } from '../src/application/agent/context-builder.js';
import { SystemPromptRenderer } from '../src/application/agent/prompt-renderer.js';
import { contextFixture } from './context-builder.test.js';

function assistant(id: 'RIN' | 'YUI', name: string, core: string[], description: string) {
  return {
    id,
    name,
    description,
    defaultAvatarState: id === 'YUI' ? ('SOFT_SMILE' as const) : ('NEUTRAL' as const),
    personaRef: id.toLowerCase(),
    enabled: true,
    persona: {
      traits: { warmth: id === 'YUI' ? 0.9 : 0.2 },
      core,
      behavior: { tone: name },
    },
  };
}

test('renders one dynamic persona template for Rin and Yui', async () => {
  const repos = contextFixture();
  repos.assistants = {
    getById: vi.fn(async (id: string) =>
      id === 'YUI'
        ? assistant('YUI', 'Yui', ['cheerful', 'caring'], 'Warm companion')
        : assistant('RIN', 'Rin', ['tsundere', 'blunt'], 'Tsundere friend'),
    ),
    listAvailable: vi.fn(async () => []),
    put: vi.fn(),
  };
  const builder = new AgentContextBuilder(repos, {
    get: async () => ({ currentTime: '2026-01-01T00:00:00Z', timezone: 'UTC' }),
  });
  const renderer = new SystemPromptRenderer();
  const rin = renderer.render(await builder.build('u', 'c', 'RIN'));
  const yui = renderer.render(await builder.build('u', 'c', 'YUI'));

  expect(rin).toContain('You are Rin.');
  expect(yui).toContain('You are Yui.');
  expect(rin).toContain('tsundere');
  expect(yui).toContain('cheerful');
  expect(rin).toContain('Tsundere friend');
  expect(yui).toContain('Warm companion');
  expect(rin).toContain('SHOPPING LIST ROUTING');
  expect(yui).toContain('SHOPPING LIST ROUTING');
  expect(rin).toContain('Never invent external information');
  expect(yui).toContain('Never invent external information');
});
