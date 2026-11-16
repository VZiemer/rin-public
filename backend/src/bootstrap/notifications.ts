import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { cert, initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { z } from 'zod';
import type { NotificationGateway } from '../application/ports/notification.js';
import { FirebaseNotificationGateway } from '../adapters/outbound/notifications/firebase.js';
import { ConsoleNotificationGateway } from '../adapters/outbound/notifications/console.js';
const serviceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.email(),
  private_key: z.string().min(1),
});
/** Reload AWSCURRENT within 60 seconds so replacing the secret works on warm Lambdas. */
export async function notificationGateway(
  region: string,
  secretArn: string | undefined,
): Promise<NotificationGateway> {
  if (!secretArn) return new ConsoleNotificationGateway();
  const client = new SecretsManagerClient({ region, maxAttempts: 2 });
  let cached: { version: string; expires: number; gateway: NotificationGateway } | undefined;
  return {
    async send(token, payload, options) {
      if (!cached || cached.expires <= Date.now()) {
        const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }), {
          abortSignal: AbortSignal.timeout(5000),
        });
        if (!result.SecretString || !result.VersionId) throw new Error('Firebase secret is empty');
        if (cached?.version === result.VersionId) {
          cached.expires = Date.now() + 60000;
        } else {
          const account = serviceAccountSchema.parse(JSON.parse(result.SecretString) as unknown);
          const existing = getApps().find((app) => app.name === 'rin');
          if (existing) await deleteApp(existing);
          const app = initializeApp(
            {
              credential: cert({
                projectId: account.project_id,
                clientEmail: account.client_email,
                privateKey: account.private_key,
              }),
            },
            'rin',
          );
          cached = {
            version: result.VersionId,
            expires: Date.now() + 60000,
            gateway: new FirebaseNotificationGateway(getMessaging(app)),
          };
        }
      }
      return options
        ? cached.gateway.send(token, payload, options)
        : cached.gateway.send(token, payload);
    },
  };
}
