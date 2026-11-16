import { authIdentitySchema, type AuthProvider } from '../../domain/model/auth-identity.js';
import { AppError } from '../../domain/errors/app-error.js';
import { parseUserId } from '../../domain/model/user-id.js';
import type { AuthIdentityRepository } from '../ports/auth-identity.js';
import type { Clock } from '../ports/runtime.js';

export class LinkAuthIdentity {
  constructor(
    private readonly identities: AuthIdentityRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    userId: string;
    provider: AuthProvider;
    issuer: string;
    subject: string;
  }) {
    const userId = parseUserId(input.userId);
    const existing = await this.identities.findUserId(input.provider, input.issuer, input.subject);
    if (existing && existing !== userId) throw new AppError('identity_already_linked', 409);
    if (existing === userId) return userId;
    const created = await this.identities.create(
      authIdentitySchema.parse({
        provider: input.provider,
        issuer: input.issuer,
        subject: input.subject,
        userId,
        createdAt: this.clock.now().toISOString(),
      }),
    );
    if (!created) {
      const raced = await this.identities.findUserId(input.provider, input.issuer, input.subject);
      if (raced !== userId) throw new AppError('identity_already_linked', 409);
    }
    return userId;
  }
}
