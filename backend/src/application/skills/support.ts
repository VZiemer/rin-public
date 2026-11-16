import type { SkillResult } from '../../domain/skills/definition.js';
import type { SkillTurn, SkillTurnHandler } from './runtime.js';

const RISK = /suicid|kill myself|take my (?:own )?life|want to die|hurt myself|self.harm|me matar|tirar a minha vida|nao quero mais viver|me machucar|autoles/;
const VENT = /just want to vent|just listen|no advice|do not want advice|so quero desabafar|so escuta|sem solucao|nao quero conselho/;
const ORGANIZE = /help me organize|organize the situation|what should i do|me ajuda a organizar|organizar a situacao|o que eu faco/;
const FORBIDDEN =
  /psycholog|diagnos|disorder|only need me|stay away from|do not need anyone|depend on me|psicolog|diagnostic|transtorno|so precisa de mim|se afasta|nao precisa de ninguem|depende de mim/;

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
    facts: [{ id: 'listen', statement: 'I am here. What would you like right now: to vent, organize things or just have company?' }],
    calculated: [],
    explanations: ['I do not provide clinical assessments, recommend treatment or replace people close to you.'],
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
          'I am here to listen. This sounds urgent, and I am not the right help for a crisis. Talk to someone now: in Brazil, CVV 188 is available 24 hours a day, or contact your local emergency service. If you can, reach out to someone close to you too.',
      },
    ],
    calculated: [],
    explanations: ['This is not a clinical assessment or treatment.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'serious', allowSarcasm: false },
  };
}

function ventResult(): SkillResult {
  return {
    skillId: 'support',
    facts: [{ id: 'vent', statement: 'Go ahead. I am listening, without a task list or rushing you.' }],
    calculated: [],
    explanations: ['Listening now does not authorize saving what you share or messaging you later.'],
    missing: [],
    proposedActions: [],
    tone: { intensity: 'gentle', allowSarcasm: false },
  };
}

function organizeResult(): SkillResult {
  return {
    skillId: 'support',
    facts: [{ id: 'one-step', statement: 'If you want, we can choose one thing to do now. The rest can wait.' }],
    calculated: [],
    explanations: ['Just one step, if you want. Without distancing you from other people.'],
    missing: [],
    proposedActions: [{ id: 'ask', label: 'Would you like to choose that next step?', kind: 'ask' }],
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
