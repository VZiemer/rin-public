import { parseUserId } from '../src/domain/model/user-id.js';

export function requiredInternalUserId(): string {
  return parseUserId(process.env.INTERNAL_USER_ID);
}
