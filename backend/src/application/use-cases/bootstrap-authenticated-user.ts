import { DEFAULT_ASSISTANT_ID } from '../../domain/model/assistant-id.js';
import type { AuthenticatedPrincipal } from '../../domain/model/principal.js';
import { createInternalUserId } from '../../domain/model/user-id.js';
import type { UserProfile } from '../../domain/model/contracts.js';
import type { AuthIdentityRepository } from '../ports/auth-identity.js';
import type { UserProfileRepository } from '../ports/context.js';
import type { Clock } from '../ports/runtime.js';

export interface BootstrapResult {
  userId: string;
  defaultAssistantId: string;
  profileInitialized: boolean;
}

export class BootstrapAuthenticatedUser {
  constructor(
    private readonly identities: AuthIdentityRepository,
    private readonly profiles: UserProfileRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    _profileClaims?: Record<string, unknown>,
  ): Promise<BootstrapResult> {
    // Claims are deliberately ignored: a new profile starts without personal provider data.
    void _profileClaims;
    const existing = await this.identities.findUserId(
      principal.provider,
      principal.issuer,
      principal.subject,
    );
    if (existing) return this.existingResult(existing);

    const userId = createInternalUserId();
    const now = this.clock.now().toISOString();
    const created = await this.identities.create({
      provider: principal.provider,
      issuer: principal.issuer,
      subject: principal.subject,
      userId,
      createdAt: now,
    });
    if (!created) {
      const raced = await this.identities.findUserId(
        principal.provider,
        principal.issuer,
        principal.subject,
      );
      if (!raced) throw new Error('identity race unresolved');
      return this.existingResult(raced);
    }

    const profile: UserProfile = {
      userId,
      primaryLanguage: 'en-US',
      professionalLanguage: 'en-US',
      work: [],
      technology: [],
      workingStyle: [],
      defaultAssistantId: DEFAULT_ASSISTANT_ID,
      createdAt: now,
      updatedAt: now,
    };
    await this.profiles.put(profile, 'insert-missing');
    return {
      userId,
      defaultAssistantId: DEFAULT_ASSISTANT_ID,
      profileInitialized: true,
    };
  }

  private async existingResult(userId: string): Promise<BootstrapResult> {
    const profile = await this.profiles.get(userId);
    return {
      userId,
      defaultAssistantId: profile?.defaultAssistantId ?? DEFAULT_ASSISTANT_ID,
      profileInitialized: Boolean(profile),
    };
  }
}
