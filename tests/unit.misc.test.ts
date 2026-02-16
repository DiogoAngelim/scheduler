import { describe, expect, it } from 'vitest';
import { AppError } from '../src/domain/types';
import { executiveCalendars, notifications, scheduledSlots } from '../src/db/schema';
import { SimulatedGoogleMeetProvider } from '../src/integrations/googleMeet';
import { addDays, enumerateDates, inWindow, normalizeDate, overlaps, startOfBrazilDayUtc } from '../src/utils/date';

describe('Date helpers and schema execution', () => {
  it('handles date operations deterministically', () => {
    expect(normalizeDate('2026-02-16')).toBe('2026-02-16');
    expect(addDays('2026-02-16', 2)).toBe('2026-02-18');
    expect(enumerateDates('2026-02-16', '2026-02-18')).toEqual(['2026-02-16', '2026-02-17', '2026-02-18']);
    expect(overlaps('2026-02-16', '2026-02-18', '2026-02-18', '2026-02-20')).toBe(true);
    expect(overlaps('2026-02-16', '2026-02-17', '2026-02-18', '2026-02-20')).toBe(false);

    const target = startOfBrazilDayUtc('2026-02-20');
    expect(target.toISOString()).toBe('2026-02-20T03:00:00.000Z');
    expect(inWindow(new Date(target.getTime()), target)).toBe(true);
    expect(inWindow(new Date(target.getTime() - 1), target)).toBe(false);
  });

  it('throws app errors for invalid date payloads', () => {
    expect(() => normalizeDate('20-02-2026')).toThrowError(AppError);
    expect(() => enumerateDates('2026-02-20', '2026-02-18')).toThrowError(AppError);
  });

  it('creates unique meet links and exposes schema tables', async () => {
    const meet = new SimulatedGoogleMeetProvider();
    const one = await meet.createMeeting({ slotId: 'slot-1', executiveId: 'e1', ownerId: 'o1' });
    const two = await meet.createMeeting({ slotId: 'slot-1', executiveId: 'e1', ownerId: 'o1' });

    expect(one).toContain('https://meet.google.com/');
    expect(two).toContain('https://meet.google.com/');
    expect(one).not.toBe(two);

    expect(executiveCalendars[Symbol.for('drizzle:Name') as any]).toBe('executive_calendars');
    expect(scheduledSlots[Symbol.for('drizzle:Name') as any]).toBe('scheduled_slots');
    expect(notifications[Symbol.for('drizzle:Name') as any]).toBe('notifications');
  });
});
