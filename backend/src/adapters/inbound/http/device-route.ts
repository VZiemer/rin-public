import type { Devices } from '../../../application/use-cases/devices.js';
import { bodyOf, response, type HttpEvent } from './handler.js';
export async function deviceRoute(event: HttpEvent, user: string, devices: Devices) {
  const match = event.rawPath.match(/^\/devices\/([\w-]{1,128})$/);
  if (!match) return null;
  const id = match[1]!;
  const method = event.requestContext.http.method;
  if (method === 'PUT') return response(200, await devices.put(user, id, bodyOf(event)));
  if (method === 'GET') return response(200, await devices.get(user, id));
  if (method === 'DELETE') {
    await devices.delete(user, id);
    return { statusCode: 204, headers: { 'cache-control': 'no-store' }, body: '' };
  }
  return null;
}
