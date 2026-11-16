export interface LocalClock {
  date: string;
  time: string;
  weekday: string;
}
export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

export function dateParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'long',
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: p.weekday ?? '',
  };
}

export function localDateTime(date: Date, timeZone: string): LocalClock {
  const p = dateParts(date, timeZone);
  return {
    date: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
    time: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
    weekday: p.weekday,
  };
}

export function hhmmToMinutes(value: string): number {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Math.min(23, Number(match[1])) * 60 + Math.min(59, Number(match[2]));
}

/**
 * Convert a wall-clock time in `timeZone` to the corresponding UTC instant.
 * Two correction passes handle standard offsets without external libraries.
 */
export function zonedLocalDateToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second?: number },
  timeZone: string,
): Date {
  let guess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
  );
  for (let i = 0; i < 2; i += 1) {
    const asZone = dateParts(new Date(guess), timeZone);
    const represented = Date.UTC(
      asZone.year,
      asZone.month - 1,
      asZone.day,
      asZone.hour,
      asZone.minute,
      asZone.second,
    );
    const wanted = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second ?? 0,
    );
    guess += wanted - represented;
  }
  return new Date(guess);
}

export function insideQuietHours(time: string, start: string, end: string): boolean {
  const value = hhmmToMinutes(time);
  const startValue = hhmmToMinutes(start);
  const endValue = hhmmToMinutes(end);
  if (startValue === endValue) return false;
  if (startValue < endValue) return value >= startValue && value < endValue;
  return value >= startValue || value < endValue;
}
