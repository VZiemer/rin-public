import type { OwnedEntity } from '../../../domain/model/contracts.js';
export type EntityType =
  | 'WORLD_SETTINGS'
  | 'MORNING_BRIEFING'
  | 'PROFILE'
  | 'PERSONA'
  | 'RELATIONSHIP_CONFIG'
  | 'PERSON'
  | 'ROUTINE'
  | 'MEMORY'
  | 'WORKING_MEMORY'
  | 'TASK'
  | 'REMINDER'
  | 'CONFIRMATION'
  | 'TEST_PUSH_DELIVERY'
  | 'DEVICE'
  | 'SHOPPING#ITEM'
  | 'RIN_STATE'
  | 'RIN_PREFERENCES'
  | 'RIN_WORLD_CONTEXT'
  | 'RIN_EPISODE'
  | 'RIN_REMINDER_LOG'
  | 'RIN_PROACTIVE_LOG'
  | 'ASSISTANT'
  | 'SKILL_ENABLEMENT'
  | 'ACTIVE_SUBJECT'
  | 'DOMAIN_RECORD'
  | 'SKILL_OPERATION'
  | 'FINANCE_ENTRY'
  | 'FINANCE_CATEGORY'
  | 'FINANCE_BILL'
  | 'FINANCE_BUDGET'
  | 'FINANCE_BALANCE'
  | 'FOLLOW_UP'
  | 'SKILL_THREAD'
  | 'ALERT_PREFERENCE'
  | 'SUPPORT_CONSENT'
  | 'KNOWLEDGE_DOC';
export function workingMemoryKey(userId: string, assistantId: string, conversationId: string) {
  if (!userId || userId.includes('#') || !conversationId || conversationId.includes('#'))
    throw new Error('Invalid working memory key');
  return { PK: `USER#${userId}`, SK: `WORKING_MEMORY#${assistantId}#${conversationId}` };
}
export function assistantKey(assistantId: string) {
  if (!assistantId || assistantId.includes('#') || assistantId.includes('USER'))
    throw new Error('Invalid assistant key');
  return { PK: `ASSISTANT#${assistantId}`, SK: 'CONFIG' };
}
export function key(userId: string, type: EntityType, id?: string) {
  if (!userId || userId.includes('#') || (id !== undefined && (!id || id.includes('#'))))
    throw new Error('Invalid entity key');
  return { PK: `USER#${userId}`, SK: type + (id === undefined ? '' : `#${id}`) };
}
export function toItem<T extends OwnedEntity>(entity: T, type: EntityType, id?: string) {
  return { ...entity, ...key(entity.userId, type, id), entityType: type };
}
export function fromItem(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(item).filter(([name]) => !['PK', 'SK', 'entityType'].includes(name)),
  );
}
