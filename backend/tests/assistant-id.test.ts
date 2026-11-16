import { expect, test } from 'vitest';
import { AppError } from '../src/domain/errors/app-error.js';
import {
  DEFAULT_ASSISTANT_ID,
  assistantIdSchema,
  isAssistantId,
  parseAssistantId,
} from '../src/domain/model/assistant-id.js';

test('accepts stable assistant identifiers independent from userId', () => {
  expect(assistantIdSchema.parse('RIN')).toBe('RIN');
  expect(assistantIdSchema.parse('yui')).toBe('YUI');
  expect(assistantIdSchema.parse(' A1 ')).toBe('A1');
  expect(DEFAULT_ASSISTANT_ID).toBe('RIN');
  expect(isAssistantId('RIN')).toBe(true);
  expect(isAssistantId('dev-user')).toBe(false);
});

test('rejects user-like or malformed assistant identifiers', () => {
  expect(isAssistantId('USER#dev-user')).toBe(false);
  expect(isAssistantId('USER')).toBe(false);
  expect(isAssistantId('RIN#1')).toBe(false);
  expect(isAssistantId('r')).toBe(false);
  expect(isAssistantId('TOO_LONG_ASSISTANT_ID')).toBe(false);
  expect(isAssistantId('rin-yui')).toBe(false);
  expect(isAssistantId(1)).toBe(false);
  expect(() => assistantIdSchema.parse('USER#x')).toThrow();
});

test('parseAssistantId throws a normalized error or applies a migration fallback', () => {
  expect(parseAssistantId('yui')).toBe('YUI');
  expect(parseAssistantId(undefined, DEFAULT_ASSISTANT_ID)).toBe('RIN');
  expect(() => parseAssistantId('unknown-id!')).toThrow(AppError);
  try {
    parseAssistantId('not valid');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('ASSISTANT_NOT_FOUND');
    expect((error as AppError).status).toBe(404);
  }
});
