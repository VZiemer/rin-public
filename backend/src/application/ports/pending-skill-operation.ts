import type { OwnedEntity } from '../../domain/model/contracts.js';
import type { SkillId } from '../../domain/skills/definition.js';

export interface PendingSkillOperation extends OwnedEntity {
  id: string;
  assistantId: string;
  conversationId: string;
  skillId: SkillId;
  name: string;
  summary: string;
  payload: Record<string, string | number | boolean>;
  expiresAt: string;
  status: 'pending' | 'applied' | 'rejected';
}

export interface PendingSkillOperationRepository {
  get(userId: string, assistantId: string, id: string): Promise<PendingSkillOperation | null>;
  put(operation: PendingSkillOperation): Promise<void>;
  listOpen(
    userId: string,
    assistantId: string,
    conversationId: string,
    now: Date,
  ): Promise<PendingSkillOperation[]>;
}

export type ConfirmationDecision = 'approve' | 'reject';

export function interpretConfirmation(message: string): ConfirmationDecision | null {
  const text = message
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/^(sim|pode|confirma|confirmo|yes)$/.test(text)) return 'approve';
  if (/^(nao|cancela|cancelar)$/.test(text)) return 'reject';
  return null;
}

export function matchPendingOperation(
  message: string,
  pending: readonly PendingSkillOperation[],
):
  | { kind: 'none' }
  | { kind: 'ambiguous' }
  | { kind: ConfirmationDecision; operation: PendingSkillOperation } {
  const decision = interpretConfirmation(message);
  if (!decision) return { kind: 'none' };
  if (pending.length !== 1) return pending.length === 0 ? { kind: 'none' } : { kind: 'ambiguous' };
  const operation = pending[0];
  if (!operation) return { kind: 'none' };
  return { kind: decision, operation };
}
