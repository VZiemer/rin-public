import { expect, test } from 'vitest';
import { InMemoryDeviceRepository } from '../src/adapters/outbound/memory/device-repository.js';
import { InMemoryAuthIdentityRepository } from '../src/adapters/outbound/memory/auth-identity-repository.js';
import { createInternalUserId } from '../src/domain/model/user-id.js';

test('profile relationship memory and device repositories require an explicit userId', async () => {
  const userA = createInternalUserId();
  const userB = createInternalUserId();
  const devices = new InMemoryDeviceRepository();
  const identities = new InMemoryAuthIdentityRepository();
  await devices.put({
    id: 'phone',
    userId: userA,
    platform: 'android',
    pushToken: 'a',
    enabled: true,
    createdAt: 'n',
    updatedAt: 'n',
  });
  await identities.create({
    provider: 'COGNITO',
    issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool',
    subject: 'sub-a',
    userId: userA,
    createdAt: 'n',
  });
  expect(await devices.get(userB, 'phone')).toBeNull();
  expect(await devices.list(userB)).toEqual([]);
  expect(await identities.listByUserId(userB)).toEqual([]);
  expect(await identities.findUserId('COGNITO', 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool', 'sub-a')).toBe(
    userA,
  );
});
