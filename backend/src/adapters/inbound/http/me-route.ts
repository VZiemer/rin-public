import type { UserProfileRepository } from '../../../application/ports/context.js';
import type { UserRequestContext } from '../../../domain/model/request-context.js';
import { AppError } from '../../../domain/errors/app-error.js';
import { response } from './handler.js';

export async function meRoute(context: UserRequestContext, profiles: UserProfileRepository) {
  const profile = await profiles.get(context.userId);
  if (!profile) throw new AppError('profile_not_found', 404);
  return response(200, {
    userId: context.userId,
    defaultAssistantId: profile.defaultAssistantId ?? 'RIN',
    primaryLanguage: profile.primaryLanguage,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  });
}
