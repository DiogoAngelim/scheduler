"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const app_1 = require("../src/app");
function auth(userId, role) {
    return {
        'x-user-id': userId,
        'x-role': role
    };
}
(0, vitest_1.describe)('Calendar API', () => {
    (0, vitest_1.it)('creates and updates executive availability with daily granularity', async () => {
        const { app } = (0, app_1.buildApp)();
        const response = await (0, supertest_1.default)(app)
            .post('/calendar/executive/exe-1')
            .set(auth('exe-1', 'EXECUTIVE'))
            .send({
            availability: [
                { date: '2026-02-20', status: 'AVAILABLE' },
                { date: '2026-02-21', status: 'BLOCKED' },
                { date: '2026-02-20', status: 'BLOCKED' }
            ]
        });
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body.timezone).toBe('America/Sao_Paulo');
        (0, vitest_1.expect)(response.body.availability).toEqual([
            { date: '2026-02-20', status: 'BLOCKED' },
            { date: '2026-02-21', status: 'BLOCKED' }
        ]);
    });
    (0, vitest_1.it)('enforces executive ownership on availability updates', async () => {
        const { app } = (0, app_1.buildApp)();
        const response = await (0, supertest_1.default)(app)
            .post('/calendar/executive/exe-2')
            .set(auth('exe-1', 'EXECUTIVE'))
            .send({ availability: [{ date: '2026-02-20', status: 'AVAILABLE' }] });
        (0, vitest_1.expect)(response.status).toBe(403);
    });
    (0, vitest_1.it)('schedules deterministic slot and creates meet link and notifications', async () => {
        const { app } = (0, app_1.buildApp)();
        const scheduled = await (0, supertest_1.default)(app)
            .post('/calendar/schedule/slot-100')
            .set(auth('system', 'SYSTEM'))
            .send({
            executiveId: 'exe-10',
            ownerId: 'owner-20',
            contractId: 'ct-1',
            auctionEndDate: '2026-02-16',
            tierOffsetDays: 2,
            tierDurationDays: 3,
            contractDeadlineDate: '2026-02-25'
        });
        (0, vitest_1.expect)(scheduled.status).toBe(201);
        (0, vitest_1.expect)(scheduled.body.startDate).toBe('2026-02-18');
        (0, vitest_1.expect)(scheduled.body.endDate).toBe('2026-02-20');
        (0, vitest_1.expect)(scheduled.body.googleMeetLink).toContain('https://meet.google.com/');
        const calendar = await (0, supertest_1.default)(app)
            .get('/calendar/executive/exe-10')
            .set(auth('exe-10', 'EXECUTIVE'));
        (0, vitest_1.expect)(calendar.status).toBe(200);
        (0, vitest_1.expect)(calendar.body.scheduledSlots).toHaveLength(1);
        (0, vitest_1.expect)(calendar.body.calendar.availability.map((item) => item.date)).toEqual([
            '2026-02-18',
            '2026-02-19',
            '2026-02-20'
        ]);
        const ownerView = await (0, supertest_1.default)(app)
            .get('/calendar/executive/exe-10')
            .set(auth('owner-20', 'OWNER'));
        (0, vitest_1.expect)(ownerView.status).toBe(200);
        (0, vitest_1.expect)(ownerView.body.scheduledSlots).toHaveLength(1);
        const ownerNotifications = await (0, supertest_1.default)(app)
            .post('/calendar/notify/owner-20')
            .set(auth('owner-20', 'OWNER'))
            .send({});
        (0, vitest_1.expect)(ownerNotifications.status).toBe(200);
        (0, vitest_1.expect)(ownerNotifications.body).toHaveLength(1);
        (0, vitest_1.expect)(ownerNotifications.body[0].type).toBe('AUCTION_CLEARED');
    });
    (0, vitest_1.it)('rejects overlapping slots and unauthorized schedule attempts', async () => {
        const { app } = (0, app_1.buildApp)();
        const first = await (0, supertest_1.default)(app)
            .post('/calendar/schedule/slot-1')
            .set(auth('system', 'SYSTEM'))
            .send({
            executiveId: 'exe-20',
            ownerId: 'owner-20',
            contractId: 'ct-2',
            auctionEndDate: '2026-02-16',
            tierOffsetDays: 1,
            tierDurationDays: 4
        });
        (0, vitest_1.expect)(first.status).toBe(201);
        const overlap = await (0, supertest_1.default)(app)
            .post('/calendar/schedule/slot-2')
            .set(auth('system', 'SYSTEM'))
            .send({
            executiveId: 'exe-20',
            ownerId: 'owner-21',
            contractId: 'ct-3',
            auctionEndDate: '2026-02-17',
            tierOffsetDays: 1,
            tierDurationDays: 2
        });
        (0, vitest_1.expect)(overlap.status).toBe(409);
        const unauthorized = await (0, supertest_1.default)(app)
            .post('/calendar/schedule/slot-3')
            .set(auth('owner-21', 'OWNER'))
            .send({
            executiveId: 'exe-20',
            ownerId: 'owner-21',
            contractId: 'ct-4',
            auctionEndDate: '2026-02-19',
            tierOffsetDays: 1,
            tierDurationDays: 2
        });
        (0, vitest_1.expect)(unauthorized.status).toBe(403);
    });
    (0, vitest_1.it)('pushes notifications from system and marks as read by owner only', async () => {
        const { app } = (0, app_1.buildApp)();
        const pushed = await (0, supertest_1.default)(app)
            .post('/calendar/notify/user-1')
            .set(auth('system', 'SYSTEM'))
            .send({
            notifications: [
                {
                    type: 'DEADLINE_ALERT',
                    referenceId: 'ct-99',
                    message: 'Contract deadline in 24h'
                }
            ]
        });
        (0, vitest_1.expect)(pushed.status).toBe(200);
        (0, vitest_1.expect)(pushed.body).toHaveLength(1);
        (0, vitest_1.expect)(pushed.body[0].read).toBe(false);
        const deniedRead = await (0, supertest_1.default)(app)
            .post('/calendar/notify/user-1')
            .set(auth('owner-2', 'OWNER'))
            .send({ markReadIds: [pushed.body[0].id] });
        (0, vitest_1.expect)(deniedRead.status).toBe(403);
        const markRead = await (0, supertest_1.default)(app)
            .post('/calendar/notify/user-1')
            .set(auth('user-1', 'OWNER'))
            .send({ markReadIds: [pushed.body[0].id] });
        (0, vitest_1.expect)(markRead.status).toBe(200);
        (0, vitest_1.expect)(markRead.body[0].read).toBe(true);
    });
    (0, vitest_1.it)('cancels before start and frees calendar for reinvestment logic trigger', async () => {
        const { app } = (0, app_1.buildApp)();
        const created = await (0, supertest_1.default)(app)
            .post('/calendar/schedule/slot-cancel')
            .set(auth('system', 'SYSTEM'))
            .send({
            executiveId: 'exe-50',
            ownerId: 'owner-50',
            contractId: 'ct-50',
            auctionEndDate: '2026-02-16',
            tierOffsetDays: 5,
            tierDurationDays: 2
        });
        (0, vitest_1.expect)(created.status).toBe(201);
        const canceled = await (0, supertest_1.default)(app)
            .post('/calendar/schedule/slot-cancel/cancel')
            .set(auth('system', 'SYSTEM'))
            .send({ nowDate: '2026-02-18' });
        (0, vitest_1.expect)(canceled.status).toBe(200);
        (0, vitest_1.expect)(canceled.body.status).toBe('CANCELED');
        const calendar = await (0, supertest_1.default)(app)
            .get('/calendar/executive/exe-50')
            .set(auth('exe-50', 'EXECUTIVE'));
        (0, vitest_1.expect)(calendar.body.calendar.availability.every((item) => item.status === 'AVAILABLE')).toBe(true);
    });
});
