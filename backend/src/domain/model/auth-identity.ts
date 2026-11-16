import { z } from 'zod';
import { userIdSchema } from './user-id.js';

export const AUTH_PROVIDERS = ['COGNITO'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const authProviderSchema = z.enum(AUTH_PROVIDERS);

const issuerSchema = z
  .string()
  .trim()
  .min(8)
  .max(256)
  .refine((value) => !value.includes('#') && !value.includes('@'), 'invalid_issuer');

const subjectSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[\w-]+$/, 'invalid_subject');

export const authIdentitySchema = z
  .object({
    provider: authProviderSchema,
    issuer: issuerSchema,
    subject: subjectSchema,
    userId: userIdSchema,
    createdAt: z.string().min(1),
  })
  .strict()
  .refine((value) => value.userId !== value.subject, 'user_id_must_not_be_subject');

export type AuthIdentity = z.infer<typeof authIdentitySchema>;

export function authLookupKey(provider: AuthProvider, issuer: string, subject: string) {
  const parsedProvider = authProviderSchema.parse(provider);
  if (!issuer || issuer.includes('#') || issuer.includes('@') || !/^[\w-]+$/.test(subject)) {
    throw new Error('invalid_auth_lookup');
  }
  return { provider: parsedProvider, issuer, subject };
}
