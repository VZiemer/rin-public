import { createApp } from './bootstrap/app.js';
import { logger } from './bootstrap/logger.js';
import { logFields } from './application/ports/logger.js';
import { eventSchema, response } from './adapters/inbound/http/handler.js';
export const serviceName = 'rin-backend';
let app: ReturnType<typeof createApp> | undefined;
function isFinanceRequest(event: unknown) {
  return (
    typeof event === 'object' &&
    event !== null &&
    'rawPath' in event &&
    typeof event.rawPath === 'string' &&
    /^\/assistants\/[^/]+\/finance\//.test(event.rawPath)
  );
}
function redactEvent(event: unknown) {
  if (!event || typeof event !== 'object') return event;
  const record = { ...(event as Record<string, unknown>) };
  if (isFinanceRequest(event)) record.body = '[REDACTED_FINANCE]';
  const headers = record.headers;
  if (!headers || typeof headers !== 'object') return record;
  const safeHeaders = Object.fromEntries(
    Object.entries(headers as Record<string, unknown>).map(([key, value]) =>
      /^(authorization|cookie|x-api-key)$/i.test(key) ? [key, '[REDACTED]'] : [key, value],
    ),
  );
  return { ...record, headers: safeHeaders };
}
export const handler = async (event: unknown) => {
  logger.event('lambda_input', logFields({ payload: redactEvent(event) }));
  let output;
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success) {
    output = response(400, { error: 'invalid_request' });
    logger.event('lambda_output', logFields({ payload: output }));
    return output;
  }
  if (parsed.data.rawPath === '/health' && parsed.data.requestContext.http.method === 'GET') {
    output = response(200, { status: 'ok', service: serviceName });
    logger.event('lambda_output', logFields({ payload: output }));
    return output;
  }
  try {
    output = await (await (app ??= createApp()))(event);
  } catch (error) {
    logger.event(
      'lambda_error',
      logFields({
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    );
    app = undefined;
    output = response(503, { error: 'service_unavailable' });
  }
  const isAssetCatalog =
    parsed.data.rawPath === '/rin/assets' ||
    /^\/assistants\/[^/]+\/assets$/.test(parsed.data.rawPath);
  logger.event(
    'lambda_output',
    logFields({
      payload: isFinanceRequest(event)
        ? { ...output, body: '[REDACTED_FINANCE]' }
        : isAssetCatalog
          ? { ...output, body: '[REDACTED_ASSET_URLS]' }
          : output,
    }),
  );
  return output;
};
