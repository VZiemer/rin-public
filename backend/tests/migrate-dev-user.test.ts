import { expect, test, vi } from 'vitest';
import { migrateDevUser } from '../scripts/migrate-dev-user.js';
import { createInternalUserId, isInternalUserId } from '../src/domain/model/user-id.js';

test('migration is idempotent and writes an internal UUID mapping', async () => {
  const userId = createInternalUserId();
  process.env.MIGRATION_USER_ID = userId;
  process.env.COGNITO_ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool';
  process.env.COGNITO_DEV_SUBJECT = 'dev-sub';
  const send = vi
    .fn()
    .mockResolvedValueOnce({ Item: undefined })
    .mockResolvedValueOnce({
      Items: [{ PK: 'USER#dev-user', SK: 'PROFILE', userId: 'dev-user', title: 'legacy' }],
    })
    .mockResolvedValue({});
  const first = await migrateDevUser({ send });
  expect(first.userId).toBe(userId);
  expect(isInternalUserId(first.userId)).toBe(true);
  expect(first.migrated).toBe(1);
  send.mockReset();
  send.mockResolvedValueOnce({ Item: { userId } });
  await expect(migrateDevUser({ send })).rejects.toThrow(/already applied/);
});
