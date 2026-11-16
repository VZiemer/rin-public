import type { SendNotification } from '../../../application/use-cases/send-notification.js';
import { createHash } from 'node:crypto';
import { financeRoute } from './finance-route.js';
import type { FinancialPlanning } from '../../../application/finance/planning.js';
import type { Statements } from '../../../application/finance/statements.js';
import type { ReadRinAssets } from '../../../application/assets/catalog.js';
import { agentOutputSchema } from '../../../domain/model/validation.js';
import { deviceRoute } from './device-route.js';
import type { Devices } from '../../../application/use-cases/devices.js';
import { reminderRoute } from './reminder-route.js';
import type { Reminders } from '../../../application/use-cases/reminders.js';
import { taskRoute } from './task-route.js';
import type { Tasks } from '../../../application/use-cases/tasks.js';
import type { AssistantPreferences } from '../../../application/use-cases/assistant-preferences.js';
import { z } from 'zod';
import type { IdGenerator } from '../../../application/ports/runtime.js';
import type { AgentOutput } from '../../../domain/model/contracts.js';
import { AppError } from '../../../domain/errors/app-error.js';
import type { AssistantRepository } from '../../../application/ports/assistant.js';
import type { UserProfileRepository } from '../../../application/ports/context.js';
import type { BootstrapAuthenticatedUser } from '../../../application/use-cases/bootstrap-authenticated-user.js';
import type { ResolveAuthenticatedUser } from '../../../application/use-cases/resolve-authenticated-user.js';
import { DEFAULT_ASSISTANT_ID, parseAssistantId } from '../../../domain/model/assistant-id.js';
import type { UserRequestContext } from '../../../domain/model/request-context.js';
import { meRoute } from './me-route.js';
import { principalOf } from './principal.js';
import { sessionBootstrapRoute } from './session-route.js';
export const eventSchema = z.object({
  rawPath: z.string(),
  requestContext: z.object({
    requestId: z.string(),
    http: z.object({ method: z.string() }),
    authorizer: z
      .object({ jwt: z.object({ claims: z.record(z.string(), z.unknown()) }).optional() })
      .optional(),
  }),
  body: z.string().nullable().optional(),
  isBase64Encoded: z.boolean().optional(),
});
export type HttpEvent = z.infer<typeof eventSchema>;
export function cleanAgentOutputForHttp(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as { message?: unknown }).message !== 'string'
  )
    return value;
  const record = value as Record<string, unknown> & { message: string };
  let text = record.message.trim();
  if (!text) return value;
  text = text.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '').trim();
  // Some providers serialize their reply fields as XML inside a response div.
  // Extract only display text; embedded action fields never authorize execution.
  if (/^<div\b[^>]*\bslot\s*=\s*["']response["'][^>]*>/i.test(text)) {
    const messageBlock = text.match(/<message\b[^>]*>([\s\S]*?)<\/message>/i);
    if (messageBlock?.[1]?.trim()) return { ...record, message: messageBlock[1].trim() };
  }
  const responseBlock = text.match(/<response\b[^>]*>([\s\S]*?)<\/response>/i);
  if (responseBlock) {
    try {
      const parsed = JSON.parse(
        responseBlock[1]!
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim(),
      ) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as { message?: unknown }).message === 'string'
      ) {
        const body = parsed as Record<string, unknown> & { message: string };
        return {
          ...record,
          message: body.message.trim(),
          avatarState: typeof body.avatarState === 'string' ? body.avatarState : record.avatarState,
          priority: typeof body.priority === 'string' ? body.priority : record.priority,
          actions: Array.isArray(body.actions) ? body.actions : record.actions,
        };
      }
    } catch {
      // fall through
    }
  }
  const messageMatch = text.match(/\bmessage\s*=\s*"((?:\\.|[^"\\])*)"/i);
  if (messageMatch) {
    let message = messageMatch[1]!;
    try {
      message = JSON.parse(`"${message}"`) as string;
    } catch {
      message = message.replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }
    const avatarMatch = text.match(/\bavatarState\s*=\s*"([^"]+)"/i);
    const priorityMatch = text.match(/\bpriority\s*=\s*"([^"]+)"/i);
    return {
      ...record,
      message: message.trim(),
      avatarState: avatarMatch?.[1] ?? record.avatarState,
      priority: priorityMatch?.[1] ?? record.priority,
      actions: Array.isArray(record.actions) ? record.actions : [],
    };
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1)) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as { message?: unknown }).message === 'string'
      ) {
        const body = parsed as Record<string, unknown> & { message: string };
        return {
          ...record,
          message: body.message.trim(),
          avatarState: typeof body.avatarState === 'string' ? body.avatarState : record.avatarState,
          priority: typeof body.priority === 'string' ? body.priority : record.priority,
          actions: Array.isArray(body.actions) ? body.actions : record.actions,
        };
      }
    } catch {
      // fall through
    }
  }
  text = text
    .replace(/<\/?response\b[^>]*>/gi, '')
    .replace(/<\/?respond\b[^>]*>/gi, '')
    .replace(/^Responding to the user[^.]*\.?\s*/i, '')
    .trim();
  return { ...record, message: text || record.message };
}
export function response(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(cleanAgentOutputForHttp(body)),
  };
}
const errorMessages: Record<string, string> = {
  invalid_request: 'Invalid request.',
  invalid_json: 'Invalid JSON.',
  body_too_large: 'Request body too large.',
  unauthorized: 'Unauthorized.',
  confirmation_required: 'Confirmation required.',
  invalid_model_output: 'Invalid model response.',
  invalid_tool_arguments: 'Invalid tool arguments.',
  model_unavailable: 'Model unavailable.',
  multiple_model_calls_unsupported: 'The model requested too many actions at once.',
  agent_deadline_exceeded: 'The agent took too long to respond.',
  max_tool_iterations: 'The agent exceeded the tool limit.',
  unknown_tool: 'Unknown tool.',
  ASSISTANT_NOT_FOUND: 'Assistant not found.',
  assistant_not_found: 'Assistant not found.',
  profile_not_found: 'Profile not found.',
  identity_already_linked: 'Identity already linked.',
  device_forbidden: 'The device does not belong to the user.',
  internal_error: 'Internal error.',
};
function errorResponse(statusCode: number, code: string) {
  return response(statusCode, {
    code: code.toUpperCase(),
    message: errorMessages[code] ?? 'Could not complete the request.',
  });
}
export interface HttpDependencies {
  rinAssets?: ReadRinAssets;
  environment: 'dev' | 'production';
  devUserId?: string;
  /** Test-only. Live app never sets this; missing JWT stays 401. */
  allowDevUserFallback?: boolean;
  cognito?: { issuer?: string; audience?: string };
  resolveUser?: Pick<ResolveAuthenticatedUser, 'execute'>;
  bootstrapUser?: BootstrapAuthenticatedUser;
  profiles?: UserProfileRepository;
  ids: IdGenerator;
  enableDebugEndpoints?: boolean;
  notifications?: SendNotification;
  financialPlanning?: FinancialPlanning;
  statements?: Statements;
  devices?: Devices;
  reminders?: Reminders;
  tasks?: Tasks;
  confirmations?: { decide(userId: string, id: string, approve: boolean): Promise<unknown> };
  assistants?: AssistantRepository;
  assistantPreferences?: AssistantPreferences;
  agent: {
    execute(
      userId: string,
      message: string,
      conversationId: string,
      input?: {
        deviceId?: string | undefined;
        assistantId?: string | undefined;
        turnId?: string | undefined;
      },
    ): Promise<AgentOutput>;
  };
}
export function bodyOf(event: HttpEvent, maxBytes = 32768): unknown {
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
      : (event.body ?? '');
    if (Buffer.byteLength(body) > maxBytes) throw new AppError('body_too_large', 413);
    return JSON.parse(body) as unknown;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('invalid_json');
  }
}
export async function userContextOf(
  event: HttpEvent,
  deps: HttpDependencies,
): Promise<UserRequestContext> {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  if (claims) {
    const principal = principalOf(event, deps.cognito);
    if (deps.resolveUser) {
      const userId = await deps.resolveUser.execute(principal);
      if (!userId) throw new AppError('unauthorized', 401);
      return { userId, principal };
    }
    throw new AppError('unauthorized', 401);
  }
  if (deps.environment === 'dev' && deps.allowDevUserFallback && deps.devUserId) {
    return {
      userId: deps.devUserId,
      principal: {
        provider: 'COGNITO',
        issuer: 'https://test.local/dev',
        subject: 'dev-fixture',
        claims: {},
      },
    };
  }
  throw new AppError('unauthorized', 401);
}

function rejectClientUserId(input: unknown) {
  if (input && typeof input === 'object' && !Array.isArray(input) && 'userId' in input) {
    throw new AppError('unauthorized', 401);
  }
}
async function resolveAssistantId(raw: string | undefined, repo?: AssistantRepository) {
  const assistantId = raw === undefined ? DEFAULT_ASSISTANT_ID : parseAssistantId(raw);
  if (!repo) return assistantId;
  const assistant = await repo.getById(assistantId);
  if (!assistant || assistant.enabled === false) throw new AppError('ASSISTANT_NOT_FOUND', 404);
  return assistant.id;
}

export function createHandler(deps?: HttpDependencies) {
  return async (input: unknown) => {
    try {
      const event = eventSchema.parse(input);
      const method = event.requestContext.http.method;
      const financeMatch = event.rawPath.match(/^\/assistants\/([^/]+)\/finance\/(.+)$/);
      if (deps?.financialPlanning && financeMatch) {
        const context = await userContextOf(event, deps);
        const assistantId = await resolveAssistantId(financeMatch[1], deps.assistants);
        const body = method === 'GET' ? undefined : bodyOf(event, 131072);
        rejectClientUserId(body);
        return response(
          200,
          await financeRoute(
            { method, path: financeMatch[2]!, userId: context.userId, assistantId, body },
            deps.financialPlanning,
            deps.statements,
          ),
        );
      }
      const assetRoute = event.rawPath.match(/^\/assistants\/([^/]+)\/assets$/);
      if (deps?.rinAssets && (assetRoute || event.rawPath === '/rin/assets') && method === 'GET') {
        await userContextOf(event, deps);
        return response(200, await deps.rinAssets.execute(assetRoute?.[1] ?? 'RIN'));
      }
      if (event.rawPath === '/health' && method === 'GET')
        return response(200, { status: 'ok', service: 'rin-backend' });
      if (deps?.bootstrapUser && event.rawPath === '/session/bootstrap' && method === 'POST') {
        if (event.body) rejectClientUserId(bodyOf(event));
        return sessionBootstrapRoute(principalOf(event, deps.cognito), deps.bootstrapUser);
      }
      if (deps?.profiles && event.rawPath === '/me' && method === 'GET') {
        return meRoute(await userContextOf(event, deps), deps.profiles);
      }
      if (deps && event.rawPath === '/agent/message' && method === 'POST') {
        const context = await userContextOf(event, deps);
        const raw = bodyOf(event);
        rejectClientUserId(raw);
        const body = z
          .object({
            message: z.string().trim().min(1).max(8000),
            deviceId: z
              .string()
              .regex(/^[\w-]{1,128}$/)
              .optional(),
            conversationId: z
              .string()
              .regex(/^[\w-]{1,128}$/)
              .optional(),
            assistantId: z.string().optional(),
          })
          .strict()
          .parse(raw);
        const assistantId = await resolveAssistantId(body.assistantId, deps.assistants);
        // Older Android clients omit conversationId on every turn. Keep their
        // device chat stable, using only the server-resolved owner and assistant.
        const conversationId =
          body.conversationId ??
          (body.deviceId
            ? `chat-${createHash('sha256')
                .update(JSON.stringify([context.userId, assistantId, body.deviceId]))
                .digest('hex')}`
            : deps.ids.next());
        return response(200, {
          ...(await deps.agent.execute(context.userId, body.message, conversationId, {
            deviceId: body.deviceId,
            assistantId,
            turnId: event.requestContext.requestId,
          })),
          conversationId,
          assistantId,
        });
      }
      if (deps?.assistantPreferences && event.rawPath === '/profile/default-assistant') {
        const context = await userContextOf(event, deps);
        if (method === 'GET')
          return response(200, {
            defaultAssistantId: await deps.assistantPreferences.getDefault(context.userId),
          });
        if (method === 'PUT') {
          const raw = bodyOf(event);
          rejectClientUserId(raw);
          const body = z.object({ assistantId: z.string() }).strict().parse(raw);
          return response(200, {
            defaultAssistantId: await deps.assistantPreferences.setDefault(
              context.userId,
              body.assistantId,
            ),
          });
        }
      }
      if (deps?.tasks && event.rawPath.startsWith('/tasks')) {
        if (method !== 'GET' && event.body) rejectClientUserId(bodyOf(event));
        const result = await taskRoute(
          event,
          (await userContextOf(event, deps)).userId,
          deps.tasks,
        );
        if (result) return result;
      }
      if (deps?.reminders && event.rawPath.startsWith('/reminders')) {
        if (method !== 'GET' && event.body) rejectClientUserId(bodyOf(event));
        const result = await reminderRoute(
          event,
          (await userContextOf(event, deps)).userId,
          deps.reminders,
        );
        if (result) return result;
      }
      if (deps?.devices && event.rawPath.startsWith('/devices/')) {
        if (method !== 'GET' && method !== 'DELETE' && event.body)
          rejectClientUserId(bodyOf(event));
        const result = await deviceRoute(
          event,
          (await userContextOf(event, deps)).userId,
          deps.devices,
        );
        if (result) return result;
      }
      if (
        deps?.notifications &&
        deps.environment === 'dev' &&
        deps.enableDebugEndpoints &&
        event.rawPath === '/debug/notifications' &&
        method === 'POST'
      ) {
        const context = await userContextOf(event, deps);
        const raw = bodyOf(event);
        rejectClientUserId(raw);
        const v = z
          .object({ deviceId: z.string().regex(/^[\w-]{1,128}$/), payload: agentOutputSchema })
          .strict()
          .parse(raw);
        return response(
          200,
          await deps.notifications.execute(context.userId, v.deviceId, v.payload),
        );
      }
      const confirmation = event.rawPath.match(/^\/agent\/confirmations\/([\w-]+)$/);
      if (deps?.confirmations && confirmation && method === 'POST') {
        const context = await userContextOf(event, deps);
        const raw = bodyOf(event);
        rejectClientUserId(raw);
        const body = z
          .object({ decision: z.enum(['approve', 'reject']) })
          .strict()
          .parse(raw);
        return response(
          200,
          await deps.confirmations.decide(
            context.userId,
            confirmation[1]!,
            body.decision === 'approve',
          ),
        );
      }
      return response(404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof AppError) return errorResponse(error.status, error.code);
      if (error instanceof z.ZodError) {
        console.error(
          JSON.stringify({
            event: 'http_validation_error',
            issues: error.issues.slice(0, 10).map((issue) => ({
              path: issue.path.join('.'),
              code: issue.code,
              message: issue.message.slice(0, 200),
            })),
          }),
        );
        return errorResponse(400, 'invalid_request');
      }
      console.error(
        JSON.stringify({
          event: 'http_internal_error',
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        }),
      );
      return errorResponse(500, 'internal_error');
    }
  };
}
export const handler = createHandler();
