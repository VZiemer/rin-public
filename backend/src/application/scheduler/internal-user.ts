import { parseUserId } from '../../domain/model/user-id.js';

export function scheduledUserIdOf(payload: { userId?: unknown }) {
  return parseUserId(payload.userId);
}
