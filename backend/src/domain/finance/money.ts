import { AppError } from '../errors/app-error.js';

export function parseAmountMinor(input: string): number {
  const trimmed = input.trim().replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(trimmed)) throw new AppError('invalid_amount', 422);
  const parts = splitAmount(trimmed);
  if (parts.whole.length > 12 || parts.whole.length === 0) throw new AppError('invalid_amount', 422);
  const amount = Number(parts.whole) * 100 + Number(parts.fraction);
  if (!Number.isSafeInteger(amount)) throw new AppError('invalid_amount', 422);
  return amount;
}

export function assertCurrency(code: string): string {
  if (!/^[A-Z]{3}$/.test(code)) throw new AppError('invalid_currency', 422);
  return code;
}

export function assertMinor(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new AppError('invalid_amount', 422);
  return amountMinor;
}

function splitAmount(trimmed: string): { whole: string; fraction: string } {
  if (trimmed.includes(',')) {
    const pieces = trimmed.split(',');
    const left = pieces[0];
    const right = pieces[1];
    if (pieces.length !== 2 || !left || right === undefined || !/^\d{1,2}$/.test(right)) {
      throw new AppError('invalid_amount', 422);
    }
    const whole = left.replaceAll('.', '');
    if (!/^\d+$/.test(whole)) throw new AppError('invalid_amount', 422);
    return { whole, fraction: right.padEnd(2, '0') };
  }
  if (/^\d+\.\d{1,2}$/.test(trimmed)) {
    const [left, right] = trimmed.split('.');
    return { whole: left ?? '0', fraction: (right ?? '').padEnd(2, '0') };
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) return { whole: trimmed.replaceAll('.', ''), fraction: '00' };
  if (/^\d+$/.test(trimmed)) return { whole: trimmed, fraction: '00' };
  throw new AppError('invalid_amount', 422);
}
