import type { AssistantRepository } from '../ports/assistant.js';
import type { UserProfileRepository } from '../ports/context.js';
import { AppError } from '../../domain/errors/app-error.js';
import { DEFAULT_ASSISTANT_ID, parseAssistantId } from '../../domain/model/assistant-id.js';

export class AssistantPreferences {
  constructor(
    private readonly profiles: UserProfileRepository,
    private readonly assistants: AssistantRepository,
  ) {}

  async getDefault(userId: string) {
    const profile = await this.profiles.get(userId);
    return parseAssistantId(profile?.defaultAssistantId, DEFAULT_ASSISTANT_ID);
  }

  async setDefault(userId: string, rawAssistantId: unknown) {
    const assistantId = parseAssistantId(rawAssistantId);
    const assistant = await this.assistants.getById(assistantId);
    if (!assistant || !assistant.enabled) throw new AppError('ASSISTANT_NOT_FOUND', 404);
    const profile = await this.profiles.get(userId);
    if (!profile) throw new AppError('invalid_request', 400);
    const now = new Date().toISOString();
    await this.profiles.put({ ...profile, defaultAssistantId: assistant.id, updatedAt: now });
    return assistant.id;
  }
}
