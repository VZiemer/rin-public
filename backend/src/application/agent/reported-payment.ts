import type { Reminder } from '../../domain/model/contracts.js';

export const normalizedPaymentText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

/** Only affirmative, first-person reports; questions, negations and plans never complete anything. */
export function reportedPaymentTarget(message: string): string | null {
  const text = normalizedPaymentText(message).replace(/^(?:rin|ei rin|oi rin)\s+/, '');
  if (
    /[?]/.test(message) ||
    /\b(nao|nunca|talvez|acho|se|vou|quando|ainda falta|metade|parcial|parcialmente)\b/.test(text)
  )
    return null;
  const match =
    text.match(/^(?:eu\s+)?(?:ja\s+)?(?:paguei|quitei|liquidei)\b(.*)$/) ??
    text.match(/^(?:a\s+)?(?:conta|fatura|boleto)\s+(?:ja\s+)?(?:esta|foi)\s+pag[oa]\b(.*)$/);
  return match ? (match[1] ?? '').trim() : null;
}

const generic = new Set([
  'eu',
  'ja',
  'a',
  'o',
  'as',
  'os',
  'um',
  'uma',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'pagar',
  'paguei',
  'pagamento',
  'pago',
  'paga',
  'conta',
  'boleto',
  'fatura',
  'quitar',
  'quitei',
  'isso',
  'essa',
  'esse',
  'aquela',
  'aquele',
  'hoje',
  'ontem',
  'agora',
  'pronto',
  'rin',
  'obrigado',
  'valeu',
]);
export function paymentWords(value: string) {
  return normalizedPaymentText(value)
    .split(/\s+/)
    .filter((word) => word && !generic.has(word));
}
export function isPaymentReminder(reminder: Pick<Reminder, 'title'>) {
  return /\b(pagar|pagamento|quitar|conta|boleto|fatura)\b/.test(
    normalizedPaymentText(reminder.title),
  );
}
export function matchesPaymentTarget(target: string, reminder: Pick<Reminder, 'title'>) {
  const words = paymentWords(target);
  const title = new Set(paymentWords(reminder.title));
  return words.length > 0 && words.every((word) => title.has(word));
}

export function hasReminderOperation(message: string, reminders: readonly Reminder[] = []) {
  const text = normalizedPaymentText(message);
  if (
    /\b(?:me\s+)?(?:lembre|lembra|avise|avisa)\b|\b(?:crie|cria|adicione|adiciona|complete|conclua|cancele)\b.{0,40}\b(?:lembrete|tarefa|task)\b/.test(
      text,
    )
  )
    return true;
  const target = reportedPaymentTarget(message);
  return (
    target !== null &&
    reminders.some(
      (reminder) =>
        isPaymentReminder(reminder) &&
        (paymentWords(target).length === 0 ||
          paymentWords(target).some((word) => paymentWords(reminder.title).includes(word))),
    )
  );
}
