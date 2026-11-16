import { expect, test, vi, afterEach } from 'vitest';
const mocks = vi.hoisted(() => ({
  secret: vi.fn(),
  push: vi.fn(),
  initialize: vi.fn(),
  remove: vi.fn(),
  apps: vi.fn(() => []),
}));
vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send = mocks.secret;
  },
  GetSecretValueCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock('firebase-admin/app', () => ({
  cert: (v: unknown) => v,
  initializeApp: mocks.initialize,
  getApps: mocks.apps,
  deleteApp: mocks.remove,
}));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ send: mocks.push }) }));
import { notificationGateway } from '../src/bootstrap/notifications.js';
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
test('Firebase reloads a replaced secret on a warm runtime after cache expires', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01'));
  const version = (id: string) => ({
    VersionId: id,
    SecretString: JSON.stringify({
      project_id: 'project',
      client_email: 'test@example.com',
      private_key: 'placeholder-' + id,
    }),
  });
  mocks.secret.mockResolvedValueOnce(version('v1')).mockResolvedValueOnce(version('v2'));
  mocks.push.mockResolvedValue('message');
  const gateway = await notificationGateway(
    'us-east-1',
    'arn:aws:secretsmanager:region:account:secret:test',
  );
  const payload = {
    message: 'test',
    avatarState: 'NEUTRAL' as const,
    priority: 'NORMAL' as const,
    actions: [],
  };
  await gateway.send('token', payload);
  await gateway.send('token', payload);
  expect(mocks.secret).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date('2026-01-01T00:01:01Z'));
  await gateway.send('token', payload);
  expect(mocks.secret).toHaveBeenCalledTimes(2);
  expect(mocks.initialize).toHaveBeenCalledTimes(2);
  expect(mocks.initialize.mock.calls[1]?.[0].credential.privateKey).toBe('placeholder-v2');
});
