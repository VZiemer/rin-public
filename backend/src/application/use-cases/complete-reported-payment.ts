import type { AgentOutput } from '../../domain/model/contracts.js';
import type { AgentContext } from '../agent/context-builder.js';
import {
  reportedPaymentTarget,
  paymentWords,
  isPaymentReminder,
  matchesPaymentTarget,
} from '../agent/reported-payment.js';
import { AppError } from '../../domain/errors/app-error.js';
import type { Reminders } from './reminders.js';

/** A payment report closes a reminder; it never executes or records a bank transaction. */
export class CompleteReportedPayment {
  constructor(private reminders: Reminders) {}

  async execute(
    userId: string,
    message: string,
    context: AgentContext,
  ): Promise<AgentOutput | null> {
    const target = reportedPaymentTarget(message);
    if (target === null) return null;
    // Compound requests stay with the tool loop so the rest of the request is preserved.
    if (
      /\b(lembre|lembra|avise|avisa|crie|cria|adicione|adiciona|agende|agenda|registre|registra|quanto|mas|falta)\b/.test(
        target,
      ) ||
      /\d/.test(target)
    )
      return null;
    const all = (await this.reminders.list(userId, 200)).filter(isPaymentReminder);
    let candidates;
    if (paymentWords(target).length) {
      candidates = all.filter((item) => matchesPaymentTarget(target, item));
      const active = candidates.filter((item) => item.status === 'active');
      if (active.length) candidates = active;
    } else {
      const latest = context.recentReminderMessages?.[0];
      const age = latest
        ? Date.parse(context.runtime.currentTime) - Date.parse(latest.sentAt)
        : Infinity;
      if (latest && age >= 0 && age < 24 * 60 * 60_000) {
        const ids = new Set(latest.reminders.map((item) => item.id));
        candidates = all.filter((item) => ids.has(item.id));
      } else candidates = all.filter((item) => item.status === 'active');
    }
    if (!candidates.length) return null;
    if (candidates.length > 1)
      return {
        message: `Which bill did you pay? There is more than one possible reminder: ${candidates.map((item) => item.title).join('; ')}.`,
        avatarState: 'FOCUSED',
        priority: 'NORMAL',
        actions: [],
      };
    const selected = candidates[0]!;
    if (selected.status === 'cancelled') return null;
    // Notification metadata may change concurrently. Retry once, re-reading the status.
    let saved;
    try {
      saved = await this.reminders.change(userId, selected.id, 'completed');
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'reminder_conflict') throw error;
      saved = await this.reminders.change(userId, selected.id, 'completed');
    }
    return {
      message:
        context.assistantId === 'RIN'
          ? `I marked “${saved.title}” as complete. No more nagging about that one. Hmph.`
          : `I marked “${saved.title}” as complete. Notifications for this reminder have ended.`,
      avatarState: 'SOFT_SMILE',
      priority: 'NORMAL',
      actions: [],
    };
  }
}
