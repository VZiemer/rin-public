import { expect, test } from 'vitest';
import { extractUserFacingText } from '../src/application/agent/model-text.js';

test('extractUserFacingText handles plain text and strips thinking noise', () => {
  expect(extractUserFacingText('Oi, tudo bem?')).toBe('Oi, tudo bem?');
  expect(extractUserFacingText('<thinking>plan</thinking>\nOi')).toBe('Oi');
});

test('extractUserFacingText prefers response blocks and respond markup', () => {
  expect(extractUserFacingText('<response>Olá</response>')).toBe('Olá');
  expect(extractUserFacingText('respond(message="Bom dia \\"você\\"")')).toBe('Bom dia "você"');
});

test('extractUserFacingText parses embedded JSON message', () => {
  expect(extractUserFacingText('lixo {"message":"Ei"} sobra')).toBe('Ei');
  expect(extractUserFacingText('')).toBe('');
});
