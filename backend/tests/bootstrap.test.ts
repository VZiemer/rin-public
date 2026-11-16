import { expect, test } from 'vitest';
import { serviceName } from '../src/index.js';
test('identifies the backend', () => expect(serviceName).toBe('rin-backend'));
