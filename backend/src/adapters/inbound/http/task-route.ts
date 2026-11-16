import { z } from 'zod';
import type { Tasks } from '../../../application/use-cases/tasks.js';
import { bodyOf, response, type HttpEvent } from './handler.js';
export async function taskRoute(event: HttpEvent, user: string, tasks: Tasks) {
  const match = event.rawPath.match(/^\/tasks(?:\/([\w-]+))?$/);
  if (!match) return null;
  const id = match[1];
  const method = event.requestContext.http.method;
  if (!id && method === 'POST') return response(201, await tasks.create(user, bodyOf(event)));
  if (!id && method === 'GET')
    return response(200, {
      items: (await tasks.list(user, 100)).filter((item) => item.status === 'pending'),
    });
  if (id && method === 'GET') return response(200, await tasks.get(user, id));
  if (id && method === 'DELETE') return response(200, await tasks.change(user, id, 'cancelled'));
  if (id && method === 'PATCH') {
    const v = z
      .object({ status: z.enum(['completed', 'cancelled']) })
      .strict()
      .parse(bodyOf(event));
    return response(200, await tasks.change(user, id, v.status));
  }
  return null;
}
