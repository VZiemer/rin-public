import { AppError } from '../../../domain/errors/app-error.js';
import { principalFromVerifiedClaims, type AuthenticatedPrincipal } from '../../../domain/model/principal.js';
import type { HttpEvent } from './handler.js';

export function principalOf(
  event: HttpEvent,
  expected?: { issuer?: string; audience?: string },
): AuthenticatedPrincipal {
  try {
    return principalFromVerifiedClaims(event.requestContext.authorizer?.jwt?.claims, expected);
  } catch {
    throw new AppError('unauthorized', 401);
  }
}
