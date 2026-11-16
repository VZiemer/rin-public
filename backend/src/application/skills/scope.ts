import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError } from '../../domain/errors/app-error.js';

export const skillAssistant = new AsyncLocalStorage<string>();

export function requireAssistant(): string {
  const assistantId = skillAssistant.getStore();
  if (!assistantId) throw new AppError('assistant_required', 400);
  return assistantId;
}
