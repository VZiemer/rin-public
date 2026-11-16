import { expect, test } from 'vitest';
import { isCharacterBanter } from '../src/application/agent/character-banter.js';
import { selectSkill, rememberSelection } from '../src/application/skills/select-intent.js';

test.each([
  'se o dólar aumentar até te compro roupas novas',
  'Quando eu ganhar na loteria, você vai poder escolher uma fantasia nova.',
  'Se fizer sol no fim de semana te levo pra praia, mas nada de reclamar da areia.',
  'Esse pijama tá velho, no meu próximo pagamento te dou um novo.',
  'Você já comprou aquelas roupas?',
])('recognizes an isolated character conversation: %s', (message) => {
  expect(isCharacterBanter('RIN', message)).toBe(true);
  expect(isCharacterBanter('YUI', message)).toBe(false);
});

test.each([
  'Se o dólar aumentar te compro roupas novas, mas adicione arroz à lista.',
  'Posso comprar uma roupa de 100 reais para você?',
  'Se eu te levar pra praia, me lembre amanhã às 10h.',
  'Você é uma IA ou uma pessoa de verdade?',
  'Quero desabafar, estou triste; quando passar te levo à praia.',
  'Se eu te comprar roupas, liste minhas tarefas.',
  'Se o dólar aumentar te compro roupas, crie uma tarefa para revisar o orçamento.',
  'Quando eu te levar à praia, configure um alarme.',
  'Se eu te der uma fantasia, você consegue comprar outra de verdade?',
])('keeps mixed, factual, practical and sensitive turns on the normal path: %s', (message) => {
  expect(isCharacterBanter('RIN', message)).toBe(false);
});

test('a gift joke leaves finance without converting it into a financial operation', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const input = {
    now,
    active: null,
    anchors: [],
    userId: 'u',
    assistantId: 'RIN',
    conversationId: 'c',
    message: 'gastei 10 reais',
  };
  const active = rememberSelection(input, selectSkill(input));
  expect(
    selectSkill({
      ...input,
      active,
      message: 'Quando eu ganhar na loteria, você vai poder escolher uma fantasia nova.',
    }),
  ).toMatchObject({ primary: 'conversation', endedPrevious: true });
  expect(
    selectSkill({ ...input, active, message: 'Posso comprar uma roupa de 100 reais para você?' })
      .primary,
  ).toBe('finance');
});
