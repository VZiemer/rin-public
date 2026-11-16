import { localTimeContext } from './local-time.js';
import type { AgentTool } from './tools.js';

/** Presentation data only: the stored ISO instant remains untouched. */
export function localSchedule(scheduledAt: string | undefined, timezone: string) {
  if (!scheduledAt || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(scheduledAt)) return null;
  const instant = new Date(scheduledAt);
  if (!Number.isFinite(instant.getTime())) return null;
  const local = localTimeContext(instant, timezone);
  return { date: local.localDate, time: local.localTime, timezone };
}

function localize(value: unknown, timezone: string): unknown {
  if (Array.isArray(value)) return value.map((item) => localize(item, timezone));
  if (!value || typeof value !== 'object') return value;
  const record = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, localize(item, timezone)]),
  );
  if (typeof record.scheduledAt === 'string')
    record.scheduledLocal = localSchedule(record.scheduledAt, timezone);
  if (typeof record.currentTime === 'string') {
    const now = new Date(record.currentTime);
    if (Number.isFinite(now.getTime())) Object.assign(record, localTimeContext(now, timezone));
  }
  return record;
}

export function withLocalToolTimes(tool: AgentTool): AgentTool {
  return {
    ...tool,
    description:
      tool.name === 'get_current_time'
        ? 'Get the current time and date in the user timezone. currentTime/currentTimestamp are UTC instants; use localTime and localDate when answering.'
        : tool.description,
    async execute(input, context) {
      const result = await tool.execute(input, context);
      return context.time ? localize(result, context.time.timezone) : result;
    },
  };
}
