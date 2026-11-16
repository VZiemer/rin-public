import type { AuthIdentityRepository } from '../ports/auth-identity.js';
import type { AuthenticatedPrincipal } from '../../domain/model/principal.js';

export class ResolveAuthenticatedUser {
  constructor(private readonly identities: AuthIdentityRepository) {}

  async execute(principal: AuthenticatedPrincipal): Promise<string | null> {
    return this.identities.findUserId(principal.provider, principal.issuer, principal.subject);
  }
}
