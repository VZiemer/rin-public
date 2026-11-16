export interface Logger {
  event(name: string, fields?: Record<string, string | number | boolean>): void;
}
export const silentLogger: Logger = { event: () => {} };
export function logFields(fields: Record<string, unknown>): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]) => {
      if (value === undefined) return [];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        return [[key, value]];
      return [[key, JSON.stringify(value)]];
    }),
  );
}
