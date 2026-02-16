"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const types_1 = require("../src/domain/types");
const schema_1 = require("../src/db/schema");
const googleMeet_1 = require("../src/integrations/googleMeet");
const date_1 = require("../src/utils/date");
(0, vitest_1.describe)('Date helpers and schema execution', () => {
    (0, vitest_1.it)('handles date operations deterministically', () => {
        (0, vitest_1.expect)((0, date_1.normalizeDate)('2026-02-16')).toBe('2026-02-16');
        (0, vitest_1.expect)((0, date_1.addDays)('2026-02-16', 2)).toBe('2026-02-18');
        (0, vitest_1.expect)((0, date_1.enumerateDates)('2026-02-16', '2026-02-18')).toEqual(['2026-02-16', '2026-02-17', '2026-02-18']);
        (0, vitest_1.expect)((0, date_1.overlaps)('2026-02-16', '2026-02-18', '2026-02-18', '2026-02-20')).toBe(true);
        (0, vitest_1.expect)((0, date_1.overlaps)('2026-02-16', '2026-02-17', '2026-02-18', '2026-02-20')).toBe(false);
        const target = (0, date_1.startOfBrazilDayUtc)('2026-02-20');
        (0, vitest_1.expect)(target.toISOString()).toBe('2026-02-20T03:00:00.000Z');
        (0, vitest_1.expect)((0, date_1.inWindow)(new Date(target.getTime()), target)).toBe(true);
        (0, vitest_1.expect)((0, date_1.inWindow)(new Date(target.getTime() - 1), target)).toBe(false);
    });
    (0, vitest_1.it)('throws app errors for invalid date payloads', () => {
        (0, vitest_1.expect)(() => (0, date_1.normalizeDate)('20-02-2026')).toThrowError(types_1.AppError);
        (0, vitest_1.expect)(() => (0, date_1.enumerateDates)('2026-02-20', '2026-02-18')).toThrowError(types_1.AppError);
    });
    (0, vitest_1.it)('creates unique meet links and exposes schema tables', async () => {
        const meet = new googleMeet_1.SimulatedGoogleMeetProvider();
        const one = await meet.createMeeting({ slotId: 'slot-1', executiveId: 'e1', ownerId: 'o1' });
        const two = await meet.createMeeting({ slotId: 'slot-1', executiveId: 'e1', ownerId: 'o1' });
        (0, vitest_1.expect)(one).toContain('https://meet.google.com/');
        (0, vitest_1.expect)(two).toContain('https://meet.google.com/');
        (0, vitest_1.expect)(one).not.toBe(two);
        (0, vitest_1.expect)(schema_1.executiveCalendars[Symbol.for('drizzle:Name')]).toBe('executive_calendars');
        (0, vitest_1.expect)(schema_1.scheduledSlots[Symbol.for('drizzle:Name')]).toBe('scheduled_slots');
        (0, vitest_1.expect)(schema_1.notifications[Symbol.for('drizzle:Name')]).toBe('notifications');
    });
});
