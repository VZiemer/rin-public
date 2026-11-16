import { expect, test } from 'vitest';
import { key, toItem, fromItem } from '../src/adapters/outbound/dynamodb/mapping.js';
test('maps composite keys without leaking storage fields', () => {
  const entity = { userId: 'u', createdAt: 'now', updatedAt: 'now', id: 't' };
  expect(key('u', 'TASK', 't')).toEqual({ PK: 'USER#u', SK: 'TASK#t' });
  expect(fromItem(toItem(entity, 'TASK', 't'))).toEqual(entity);
  expect(() => key('u#other', 'TASK', 't')).toThrow();
  expect(key('u', 'PROFILE').SK).toBe('PROFILE');
});
