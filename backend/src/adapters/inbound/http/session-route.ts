import type { BootstrapAuthenticatedUser } from '../../../application/use-cases/bootstrap-authenticated-user.js';
import type { AuthenticatedPrincipal } from '../../../domain/model/principal.js';
import { response } from './handler.js';

export async function sessionBootstrapRoute(
  principal: AuthenticatedPrincipal,
  bootstrap: BootstrapAuthenticatedUser,
) {
  return response(200, await bootstrap.execute(principal));
}
