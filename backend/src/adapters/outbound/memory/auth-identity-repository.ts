import { authIdentitySchema, type AuthProvider } from '../../../domain/model/auth-identity.js';
import { parseUserId } from '../../../domain/model/user-id.js';
import type { AuthIdentityRepository } from '../../../application/ports/auth-identity.js';

function lookupKey(provider: AuthProvider, issuer: string, subject: string) {
  return `${provider}\0${issuer}\0${subject}`;
}

export class InMemoryAuthIdentityRepository implements AuthIdentityRepository {
  constructor(private readonly items = new Map<string, ReturnType<typeof authIdentitySchema.parse>>()) {}

  async findUserId(provider: AuthProvider, issuer: string, subject: string) {
    return (await this.get(provider, issuer, subject))?.userId ?? null;
  }

  async get(provider: AuthProvider, issuer: string, subject: string) {
    return this.items.get(lookupKey(provider, issuer, subject)) ?? null;
  }

  async create(identity: ReturnType<typeof authIdentitySchema.parse>) {
    const parsed = authIdentitySchema.parse(identity);
    const key = lookupKey(parsed.provider, parsed.issuer, parsed.subject);
    if (this.items.has(key)) return false;
    this.items.set(key, parsed);
    return true;
  }

  async listByUserId(userId: string) {
    const parsed = parseUserId(userId);
    return [...this.items.values()].filter((identity) => identity.userId === parsed);
  }
}
