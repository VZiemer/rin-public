import { AppError } from '../errors/app-error.js';

export function localDateInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  return assertLocalDate(date);
}

export function assertLocalDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError('invalid_date', 422);
  return value;
}

export function periodOf(localDate: string): string {
  return assertLocalDate(localDate).slice(0, 7);
}

export function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${assertLocalDate(fromDate)}T00:00:00.000Z`);
  const to = Date.parse(`${assertLocalDate(toDate)}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

export function isInPeriod(localDate: string, period: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new AppError('invalid_period', 422);
  return periodOf(localDate) === period;
}
