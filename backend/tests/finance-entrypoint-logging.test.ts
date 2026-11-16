import { expect, test, vi } from 'vitest';
import { event } from './http-fixture.js';

const mocks = vi.hoisted(() => ({ handle: vi.fn(), log: vi.fn() }));
vi.mock('../src/bootstrap/app.js', () => ({ createApp: async () => mocks.handle }));
vi.mock('../src/bootstrap/logger.js', () => ({ logger: { event: mocks.log } }));
const { handler } = await import('../src/index.js');

test.each([
  ['POST', 'statements'],
  ['GET', 'statements/01900000-0000-7000-8000-000000000001'],
  ['POST', 'statements/01900000-0000-7000-8000-000000000001/commit'],
  ['GET', 'history'],
])(
  'finance %s %s redacts request/response bodies without changing the HTTP response',
  async (method, path) => {
    mocks.log.mockClear();
    const body = JSON.stringify({
      privateDescription: 'private-statement-row',
      url: 'https://s3.example/?signature=private-upload-signature',
    });
    const output = { statusCode: 200, body };
    mocks.handle.mockResolvedValue(output);
    const input = {
      ...event(method, `/assistants/RIN/finance/${path}`, {
        privateDescription: 'private-statement-row',
      }),
      headers: { authorization: 'Bearer private-jwt' },
    };
    expect(await handler(input)).toEqual(output);
    const logged = JSON.stringify(mocks.log.mock.calls);
    expect(logged).toContain('[REDACTED_FINANCE]');
    expect(logged).not.toContain('private-statement-row');
    expect(logged).not.toContain('private-upload-signature');
    expect(logged).not.toContain('private-jwt');
    expect(input.body).toContain('private-statement-row');
  },
);
