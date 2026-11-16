import { expect, test } from 'vitest';
import {
  hhmmToMinutes,
  insideQuietHours,
  localDateTime,
  zonedLocalDateToUtc,
} from '../src/application/agent/clock-zone.js';

test('hhmmToMinutes parses clock strings defensively', () => {
  expect(hhmmToMinutes('08:30')).toBe(510);
  expect(hhmmToMinutes('nonsense')).toBe(0);
});

test('insideQuietHours supports overnight windows with exclusive end', () => {
  expect(insideQuietHours('23:45', '23:30', '08:00')).toBe(true);
  expect(insideQuietHours('07:00', '23:30', '08:00')).toBe(true);
  expect(insideQuietHours('08:00', '23:30', '08:00')).toBe(false);
  expect(insideQuietHours('12:00', '23:30', '08:00')).toBe(false);
});

test('zonedLocalDateToUtc and localDateTime round-trip Sao Paulo wall clock', () => {
  const utc = zonedLocalDateToUtc(
    { year: 2026, month: 1, day: 2, hour: 19, minute: 0 },
    'America/Sao_Paulo',
  );
  expect(utc.toISOString()).toBe('2026-01-02T22:00:00.000Z');
  const local = localDateTime(new Date('2026-01-02T22:00:00Z'), 'America/Sao_Paulo');
  expect(local).toEqual({ date: '2026-01-02', time: '19:00', weekday: 'Friday' });
});
