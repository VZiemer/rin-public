import type { AuthProvider } from '../../../domain/model/auth-identity.js';

export function authIdentityLookupKey(provider: AuthProvider, issuer: string, subject: string) {
  if (!provider || !issuer || !subject || [provider, issuer, subject].some((part) => part.includes('#'))) {
    throw new Error('Invalid auth identity key');
  }
  return { PK: `AUTH#${provider}#${issuer}#${subject}`, SK: 'IDENTITY' };
}

export function authIdentityUserKey(
  userId: string,
  provider: AuthProvider,
  issuer: string,
  subject: string,
) {
  if (!userId || userId.includes('#')) throw new Error('Invalid auth identity user key');
  return {
    PK: `USER#${userId}`,
    SK: `AUTH_IDENTITY#${provider}#${issuer}#${subject}`,
  };
}

export function deviceOwnershipKey(deviceId: string) {
  if (!deviceId || deviceId.includes('#')) throw new Error('Invalid device ownership key');
  return { PK: `DEVICE#${deviceId}`, SK: 'CONFIG' };
}
