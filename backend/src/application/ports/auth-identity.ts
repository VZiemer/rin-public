import type { AuthIdentity, AuthProvider } from '../../domain/model/auth-identity.js';

export interface AuthIdentityRepository {
  findUserId(provider: AuthProvider, issuer: string, subject: string): Promise<string | null>;
  get(provider: AuthProvider, issuer: string, subject: string): Promise<AuthIdentity | null>;
  create(identity: AuthIdentity): Promise<boolean>;
  listByUserId(userId: string): Promise<AuthIdentity[]>;
}
