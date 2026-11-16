export interface LocalTimeContext {
  currentTimestamp: string;
  timezone: string;
  localDate: string;
  localWeekday: string;
  localTime?: string;
}

export function localTimeContext(now: Date, timezone: string): LocalTimeContext {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    currentTimestamp: now.toISOString(),
    timezone,
    localDate: `${value('year')}-${value('month')}-${value('day')}`,
    localWeekday: value('weekday'),
    localTime: `${value('hour')}:${value('minute')}`,
  };
}

export function localDateOf(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((v) => v.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addLocalDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function offsetMinutes(timezone: string, instant: Date): number {
  const value =
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(instant)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = value.match(/^GMT(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?$/);
  if (!match?.groups) return 0;
  const sign = match.groups.sign === '-' ? -1 : 1;
  return sign * (Number(match.groups.hours) * 60 + Number(match.groups.minutes ?? 0));
}

export function localDateTimeToIso(localDate: string, time: string, timezone: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const guessed = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0),
  );
  const offset = offsetMinutes(timezone, guessed);
  return new Date(guessed.getTime() - offset * 60_000).toISOString();
}
