import { AppError } from '../domain/types';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function assertDateOnly(value: string): void {
  if (!DATE_REGEX.test(value)) {
    throw new AppError(`Invalid date format: ${value}. Use YYYY-MM-DD`, 400);
  }
}

export function normalizeDate(value: string): string {
  assertDateOnly(value);
  return value;
}

export function addDays(date: string, days: number): string {
  assertDateOnly(date);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function enumerateDates(startDate: string, endDate: string): string[] {
  assertDateOnly(startDate);
  assertDateOnly(endDate);
  if (startDate > endDate) {
    throw new AppError('startDate must be <= endDate', 400);
  }

  const result: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return !(aEnd < bStart || bEnd < aStart);
}

export function startOfBrazilDayUtc(dateOnly: string): Date {
  assertDateOnly(dateOnly);
  return new Date(`${dateOnly}T03:00:00.000Z`);
}

export function inWindow(now: Date, target: Date, windowMs = 60 * 60 * 1000): boolean {
  const delta = now.getTime() - target.getTime();
  return delta >= 0 && delta < windowMs;
}
