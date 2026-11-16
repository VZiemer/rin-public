import { expect, test } from 'vitest';
import { handler } from '../src/adapters/inbound/http/handler.js';
import { event } from './http-fixture.js';
test('health, malformed and missing routes', async () => {
  expect((await handler(event('GET', '/health'))).statusCode).toBe(200);
  expect((await handler({})).statusCode).toBe(400);
  expect((await handler(event('POST', '/health'))).statusCode).toBe(404);
});
