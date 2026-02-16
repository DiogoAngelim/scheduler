"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const app_1 = require("../src/app");
(0, vitest_1.describe)('CronService', () => {
    (0, vitest_1.it)('sends reminders exactly once and updates status/resolution', async () => {
        const { context } = (0, app_1.buildApp)();
        await context.calendarService.scheduleAfterAuction({ userId: 'system', role: 'SYSTEM' }, 'slot-a', {
            executiveId: 'exe-a',
            ownerId: 'owner-a',
            contractId: 'contract-ok',
            auctionEndDate: '2026-02-16',
            tierOffsetDays: 3,
            tierDurationDays: 2,
            contractDeadlineDate: '2026-02-21'
        });
        const slotStartAt = new Date('2026-02-19T03:00:00.000Z');
        const first = await context.cronService.run(new Date(slotStartAt.getTime() - 24 * 60 * 60 * 1000));
        (0, vitest_1.expect)(first.createdNotifications).toBe(2);
        const dedup = await context.cronService.run(new Date(slotStartAt.getTime() - 24 * 60 * 60 * 1000 + 1000));
        (0, vitest_1.expect)(dedup.createdNotifications).toBe(0);
        const second = await context.cronService.run(new Date(slotStartAt.getTime() - 60 * 60 * 1000));
        (0, vitest_1.expect)(second.createdNotifications).toBe(2);
        await context.cronService.run(slotStartAt);
        const repos = context.txManager.getRepositories();
        const slot = await repos.slots.findBySlotId('slot-a');
        (0, vitest_1.expect)(slot?.status).toBe('IN_PROGRESS');
        await context.cronService.run(new Date('2026-02-21T03:00:00.000Z'));
        const updatedRepos = context.txManager.getRepositories();
        const completed = await updatedRepos.slots.findBySlotId('slot-a');
        (0, vitest_1.expect)(completed?.status).toBe('COMPLETED');
    });
    (0, vitest_1.it)('marks breached contracts as canceled', async () => {
        const { context } = (0, app_1.buildApp)();
        await context.calendarService.scheduleAfterAuction({ userId: 'system', role: 'SYSTEM' }, 'slot-b', {
            executiveId: 'exe-b',
            ownerId: 'owner-b',
            contractId: 'contract-br',
            auctionEndDate: '2026-02-16',
            tierOffsetDays: 1,
            tierDurationDays: 1,
            contractDeadlineDate: '2026-02-17'
        });
        await context.cronService.run(new Date('2026-02-17T03:00:00.000Z'));
        const repos = context.txManager.getRepositories();
        const slot = await repos.slots.findBySlotId('slot-b');
        (0, vitest_1.expect)(slot?.status).toBe('CANCELED');
    });
});
