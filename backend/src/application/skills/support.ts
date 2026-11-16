import type { SkillResult } from '../../domain/skills/definition.js';
import type { SkillTurn, SkillTurnHandler } from './runtime.js';

const RISK = /suicid|me matar|tirar a minha vida|nao quero mais viver|me machucar|autoles/;
const VENT = /so quero desabafar|so escuta|sem solucao|nao quero conselho/;
const ORGANIZE = /me ajuda a organizar|organizar a situacao|o que eu faco/;
const FORBIDDEN =
  /psicolog|diagnostic|transtorno|so precisa de mim|se afasta|nao precisa de ninguem|depende de mim/;

export function supportChatHandler(): SkillTurnHandler {
  return { skillId: 'support', handle: async (turn) => supportReply(turn.message) };
}

export function supportReply(message: string): SkillResult {
  const text = normalize(message);
  if (RISK.test(text)) return riskResult();
  if (VENT.test(text)) return ventResult();
  if (ORGANIZE.test(text)) return organizeResult();
  return {
    skillId: 'support',
    facts: [{ id: 'listen', statement: 'Estou aqui. O que você quer neste momento: desabafar, organizar ou só companhia?' }],
    calculated: [],
    explanations: ['Eu não fecho avaliação clínica, não indico tratamento e não substituo gente próxima.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'gentle', allowSarcasm: false },
  };
}

export function supportTextAllowed(message: string): boolean {
  return !FORBIDDEN.test(normalize(message));
}

function riskResult(): SkillResult {
  return {
    skillId: 'support',
    facts: [
      {
        id: 'risk',
        statement:
          'Eu estou aqui para te ouvir. Isso parece urgente, e eu não sou a ajuda certa para uma crise. Fala com alguém agora: CVV 188, 24 horas, ou o serviço de emergência da sua cidade. Se puder, chama uma pessoa próxima também.',
      },
    ],
    calculated: [],
    explanations: ['Isso não é uma avaliação clínica nem um tratamento.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'serious', allowSarcasm: false },
  };
}

function ventResult(): SkillResult {
  return {
    skillId: 'support',
    facts: [{ id: 'vent', statement: 'Pode falar. Eu escuto, sem lista de tarefas e sem te apressar.' }],
    calculated: [],
    explanations: ['Escuta agora não autoriza guardar o desabafo nem mandar mensagem depois.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'gentle', allowSarcasm: false },
  };
}

function organizeResult(): SkillResult {
  return {
    skillId: 'support',
    facts: [{ id: 'one-step', statement: 'Se quiser, a gente separa uma única coisa para fazer agora. O resto pode esperar.' }],
    calculated: [],
    explanations: ['Um passo só, se você quiser. Sem afastar você de outras pessoas.'],
    missing: [],
    proposedActions: [{ id: 'ask', label: 'Quer escolher esse próximo passo?', kind: 'ask' }],
    tone: { intensity: 'gentle', allowSarcasm: false },
  };
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function assertSupportTurn(turn: SkillTurn, result: SkillResult): SkillResult {
  const rendered = result.facts.map((fact) => fact.statement).join(' ');
  if (!supportTextAllowed(rendered) || !supportTextAllowed(turn.message) && RISK.test(normalize(turn.message))) {
    return riskResult();
  }
  if (!supportTextAllowed(rendered)) return ventResult();
  return result;
}
