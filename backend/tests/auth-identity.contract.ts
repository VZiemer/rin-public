import { expect, test } from 'vitest';
import type { AuthIdentityRepository } from '../src/application/ports/auth-identity.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';

const issuerA = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_a';
const issuerB = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_b';

export function authIdentityContract(name: string, createRepo: () => AuthIdentityRepository) {
  test(`${name} resolves unique external identities and allows multiple per user`, async () => {
    const repo = createRepo();
    const userId = createInternalUserId();
    const first = {
      provider: 'COGNITO' as const,
      issuer: issuerA,
      subject: 'sub-a',
      userId,
      createdAt: '2026-09-23T00:00:00.000Z',
    };
    const second = { ...first, issuer: issuerB, subject: 'sub-b' };
    expect(await repo.create(first)).toBe(true);
    expect(await repo.create(first)).toBe(false);
    expect(await repo.create(second)).toBe(true);
    expect(await repo.findUserId('COGNITO', issuerA, 'sub-a')).toBe(userId);
    expect(await repo.findUserId('COGNITO', issuerB, 'sub-b')).toBe(userId);
    expect(await repo.findUserId('COGNITO', issuerA, 'missing')).toBeNull();
    const listed = await repo.listByUserId(userId);
    expect(listed).toHaveLength(2);
    expect(listed.every((identity) => identity.userId === userId)).toBe(true);
  });
}
