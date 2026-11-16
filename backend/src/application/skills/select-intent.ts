import type { SkillId } from '../../domain/skills/definition.js';
import { isCharacterBanter } from '../agent/character-banter.js';
import type { Reminder } from '../../domain/model/contracts.js';
import { hasReminderOperation } from '../agent/reported-payment.js';
import { isFlirtIntent, endsFlirt, continuesFlirt } from './flirt.js';
import {
  isSubjectExpired,
  subjectExpiry,
  subjectId,
  type ActiveSubject,
  type SkillSelection,
  type SubjectAnchor,
} from '../../domain/skills/subject.js';

const FINANCE_WORDS = [
  'extrato',
  'fatura',
  'plano financeiro',
  'posso comprar',
  'consigo comprar',
  'quanto posso',
  'livre para gastar',
  'divida',
  'dividas',
  'gastei',
  'gasto',
  'gastos',
  'reais',
  'orcamento',
  'vencimento',
  'salario',
  'recebi',
  'paguei',
  'despesa',
  'receita',
];
const SUPPORT_WORDS = [
  'desesperado',
  'desesperada',
  'ansioso',
  'ansiosa',
  'ansiedade',
  'triste',
  'desabafar',
  'desabafo',
  'sofrendo',
  'angustiado',
  'angustiada',
  'nao aguento',
  'panico',
  'chorando',
  'so quero desabafar',
  'quero morrer',
  'me matar',
  'me machucar',
];

export interface SelectionInput {
  message: string;
  now: Date;
  active: ActiveSubject | null;
  anchors: readonly SubjectAnchor[];
  userId: string;
  assistantId: string;
  conversationId: string;
  reminders?: readonly Reminder[];
}

export function selectSkill(input: SelectionInput): SkillSelection {
  const text = normalize(input.message);
  const active = live(input.active, input.now);
  const anchors = input.anchors.filter((anchor) => fresh(anchor.at, input.now));
  const leavingFinance = isLeavingFinance(text);
  const finance = leavingFinance ? 0 : hits(text, FINANCE_WORDS) + (text.includes('r$') ? 1 : 0);
  const support = hits(text, SUPPORT_WORDS);

  if (hasReminderOperation(input.message, input.reminders))
    return selection('conversation', 'explicit', ended(active, 'conversation'));

  if (isClearTopic(text) || endsFlirt(text) || (leavingFinance && support === 0)) {
    return selection('conversation', 'explicit', ended(active, 'conversation'));
  }
  if (finance > 0 && support > 0) {
    return selection('support', 'inferred', ended(active, 'support', 'finance'), 'finance');
  }
  // World questions leave the previous skill, including "e aquela notícia de política?".
  // Explicit personal-finance and support intents still take priority.
  if (finance === 0 && support === 0 && isWorldConversation(text))
    return selection('conversation', 'explicit', ended(active, 'conversation'));
  if (input.assistantId === 'RIN' && finance === 0 && support === 0 && isFlirtIntent(text))
    return selection('flirt', 'explicit', ended(active, 'flirt'));
  if (
    input.assistantId === 'RIN' &&
    finance === 0 &&
    support === 0 &&
    (isRinBanter(text) || isCharacterBanter(input.assistantId, input.message))
  )
    return selection('conversation', 'explicit', ended(active, 'conversation'));
  if (active?.primary === 'flirt' && finance === 0 && support === 0) {
    if (input.assistantId === 'RIN' && continuesFlirt(text))
      return selection('flirt', 'continued', false);
    return selection('conversation', 'inferred', true);
  }
  if (
    isReferential(text) &&
    finance > 0 &&
    anchors.some((anchor) => anchor.skillId === 'finance')
  ) {
    return selection('finance', 'reference', ended(active, 'finance'));
  }
  if (isReferential(text) && finance === 0 && support === 0) {
    const referenced = referencedSkill(text, anchors, active);
    if (referenced) {
      const reason = active?.primary === referenced ? 'continued' : 'reference';
      return selection(referenced, reason, ended(active, referenced, active?.secondary));
    }
    return selection('conversation', 'inferred', ended(active, 'conversation'));
  }
  if (finance > 0) return selection('finance', 'explicit', ended(active, 'finance'));
  if (support > 0) return selection('support', 'explicit', ended(active, 'support'));
  if (active) return selection(active.primary, 'continued', false, active.secondary);
  return selection('conversation', 'inferred', false);
}

export function rememberSelection(input: SelectionInput, choice: SkillSelection): ActiveSubject {
  const subject: ActiveSubject = {
    id: subjectId(input.assistantId, input.conversationId),
    userId: input.userId,
    assistantId: input.assistantId,
    conversationId: input.conversationId,
    primary: choice.primary,
    reason: choice.reason,
    createdAt: input.active?.createdAt ?? input.now.toISOString(),
    updatedAt: input.now.toISOString(),
    expiresAt: subjectExpiry(input.now),
  };
  if (choice.secondary) subject.secondary = choice.secondary;
  return subject;
}

function selection(
  primary: SkillId,
  reason: SkillSelection['reason'],
  endedPrevious: boolean,
  secondary?: SkillId,
): SkillSelection {
  const choice: SkillSelection = { primary, reason, endedPrevious };
  if (secondary && secondary !== primary) choice.secondary = secondary;
  return choice;
}

function ended(active: ActiveSubject | null, primary: SkillId, secondary?: SkillId): boolean {
  if (!active || active.primary === primary) return false;
  if (secondary && active.primary === secondary) return false;
  return true;
}

function live(subject: ActiveSubject | null, now: Date): ActiveSubject | null {
  if (!subject || isSubjectExpired(subject, now)) return null;
  return subject;
}

function fresh(at: string, now: Date): boolean {
  return now.getTime() - Date.parse(at) < 6 * 60 * 60 * 1000;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function hits(text: string, words: readonly string[]): number {
  return words.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);
}

function isReferential(text: string): boolean {
  return /\b(continua|continue|aquele|aquela|aquilo|isso)\b/.test(text);
}

function isRinBanter(text: string): boolean {
  return (
    /\b(flert\w*|cantad\w*|me beija|me da um beijo|namora comigo|namoraria comigo|casa comigo|casaria comigo|me daria uma chance)\b/.test(
      text,
    ) ||
    /\b(voce|vc|rin)\b.{0,30}\b(linda|gata|gostosa|sexy|fofa|chata|idiota|boba)\b/.test(text) ||
    /\bsua (linda|gata|gostosa|fofa|chata|boba)\b/.test(text)
  );
}

function isWorldConversation(text: string): boolean {
  return (
    /\b(noticias?|manchetes?|politica|economia|tecnologia|previsao|clima|chuva|temperatura|cotacao|dolar)\b/.test(
      text,
    ) ||
    (/\b(cidade|interesses|bom dia)\b/.test(text) &&
      /\b(configur|mor[oae]|mude|mud[ae]r|ativ[ae]|desativ|par[ae]|quero|prefiro)/.test(text))
  );
}

function isClearTopic(text: string): boolean {
  return (
    text.includes('mudar de assunto') ||
    text.includes('muda de assunto') ||
    text.includes('outro assunto') ||
    text.includes('falar de outra coisa') ||
    text.includes('falar do jantar') ||
    text.includes('vamos falar do jantar')
  );
}

function isLeavingFinance(text: string): boolean {
  const dropsFinance =
    /\b(esquece|deixa|chega de)\b/.test(text) &&
    /\b(divida|dividas|grana|dinheiro|gasto|gastos)\b/.test(text);
  return dropsFinance || (/\b(divida|dividas|grana)\b/.test(text) && isClearTopic(text));
}

function referencedSkill(
  text: string,
  anchors: readonly SubjectAnchor[],
  active: ActiveSubject | null,
): SkillId | null {
  if (/\bcontinua/.test(text) && active) return active.primary;
  const skills = [...new Set(anchors.map((anchor) => anchor.skillId))];
  if (skills.length === 1) return skills[0] ?? null;
  return active?.primary ?? null;
}
