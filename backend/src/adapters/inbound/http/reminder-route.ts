import { z } from 'zod';
import type { Reminders } from '../../../application/use-cases/reminders.js';
import { bodyOf, response, type HttpEvent } from './handler.js';
export async function reminderRoute(event: HttpEvent, user: string, reminders: Reminders) {
  const match = event.rawPath.match(/^\/reminders(?:\/([\w-]+))?$/);
  if (!match) return null;
  const id = match[1];
  const method = event.requestContext.http.method;
  if (!id && method === 'POST') return response(201, await reminders.create(user, bodyOf(event)));
  if (!id && method === 'GET')
    return response(200, {
      items: (await reminders.list(user, 100)).filter((item) => item.status === 'active'),
    });
  if (id && method === 'GET') return response(200, await reminders.get(user, id));
  if (id && method === 'DELETE')
    return response(200, await reminders.change(user, id, 'cancelled'));
  if (id && method === 'PATCH') {
    const v = z
      .discriminatedUnion('action', [
        z
          .object({ action: z.literal('snooze'), scheduledAt: z.iso.datetime({ offset: true }) })
          .strict(),
        z.object({ action: z.enum(['completed', 'cancelled']) }).strict(),
      ])
      .parse(bodyOf(event));
    return response(
      200,
      await reminders.change(user, id, v.action, 'scheduledAt' in v ? v.scheduledAt : undefined),
    );
  }
  return null;
}
