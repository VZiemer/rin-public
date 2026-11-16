import { z } from 'zod';
import { authProviderSchema, type AuthProvider } from './auth-identity.js';

export const authenticatedPrincipalSchema = z
  .object({
    provider: authProviderSchema,
    issuer: z
      .string()
      .trim()
      .min(8)
      .max(256)
      .refine((value) => !value.includes('#') && !value.includes('@'), 'invalid_issuer'),
    subject: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[\w-]+$/),
    claims: z.record(z.string(), z.unknown()),
  })
  .strict();

export type AuthenticatedPrincipal = z.infer<typeof authenticatedPrincipalSchema>;

export function principalFromVerifiedClaims(
  claims: Record<string, unknown> | undefined,
  expected?: { issuer?: string; audience?: string },
): AuthenticatedPrincipal {
  if (!claims) throw new Error('unauthorized');
  const subject = claims.sub;
  const issuer = claims.iss;
  if (typeof subject !== 'string' || typeof issuer !== 'string') throw new Error('unauthorized');
  if (expected?.issuer && issuer !== expected.issuer) throw new Error('unauthorized');
  if (expected?.audience) {
    const audience = claims.client_id ?? claims.aud;
    const audiences = Array.isArray(audience) ? audience : [audience];
    if (!audiences.includes(expected.audience)) throw new Error('unauthorized');
  }
  return authenticatedPrincipalSchema.parse({
    provider: 'COGNITO' as AuthProvider,
    issuer,
    subject,
    claims,
  });
}
