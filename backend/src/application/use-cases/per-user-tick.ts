import { logFields, silentLogger, type Logger } from '../ports/logger.js';
import type { TickUserSource } from '../ports/tick.js';

export interface PerUserTickResult {
  userId: string;
  decision: string;
  reason?: string;
}

export interface PerUserTickOptions {
  name: string;
  users: TickUserSource;
  run: (userId: string) => Promise<Record<string, unknown>>;
  logger?: Logger;
  concurrency?: number;
}

/** Runs a single-user tick for every user owning an enabled device; one user's failure never blocks the others. */
export async function runPerUserTick(options: PerUserTickOptions) {
  const log = options.logger ?? silentLogger;
  const userIds = await options.users.listUserIdsWithDevices();
  log.event(`${options.name}_users`, logFields({ count: userIds.length }));
  const results: PerUserTickResult[] = [];
  const queue = [...userIds];
  const worker = async () => {
    for (let userId = queue.shift(); userId; userId = queue.shift()) {
      try {
        const output = await options.run(userId);
        results.push({
          userId,
          decision: String(output.decision ?? 'UNKNOWN'),
          ...(typeof output.reason === 'string' ? { reason: output.reason } : {}),
        });
      } catch (error) {
        log.event(
          `${options.name}_user_error`,
          logFields({
            userId,
            errorName: error instanceof Error ? error.name : typeof error,
            errorMessage: error instanceof Error ? error.message : String(error),
          }),
        );
        results.push({ userId, decision: 'FAILED', reason: 'error' });
      }
    }
  };
  const workers = Math.max(1, Math.min(options.concurrency ?? 3, userIds.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return {
    users: userIds.length,
    sent: results.filter((r) => r.decision === 'SENT').length,
    failed: results.filter((r) => r.decision === 'FAILED').length,
    results,
  };
}
