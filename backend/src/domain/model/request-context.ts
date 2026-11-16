import type { AuthenticatedPrincipal } from './principal.js';

export interface UserRequestContext {
  userId: string;
  principal: AuthenticatedPrincipal;
}
