"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const types_1 = require("../src/domain/types");
const calendarController_1 = require("../src/controllers/calendarController");
const rbac_1 = require("../src/auth/rbac");
function auth(userId, role) {
    return {
        'x-user-id': userId,
        'x-role': role
    };
}
(0, vitest_1.describe)('Branch coverage', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.resetModules();
    });
    (0, vitest_1.it)('returns 401 for missing auth headers and 400 for zod validation', async () => {
        const { buildApp } = await Promise.resolve().then(() => __importStar(require('../src/app')));
        const { app } = buildApp();
        const noAuth = await (0, supertest_1.default)(app).get('/calendar/executive/exe-1');
        (0, vitest_1.expect)(noAuth.status).toBe(401);
        const invalidMarkRead = await (0, supertest_1.default)(app)
            .post('/calendar/notify/u1')
            .set(auth('u1', 'OWNER'))
            .send({ markReadIds: ['not-uuid'] });
        (0, vitest_1.expect)(invalidMarkRead.status).toBe(400);
    });
    (0, vitest_1.it)('throws unauthorized when auth context is absent', () => {
        (0, vitest_1.expect)(() => (0, rbac_1.requireAuth)({})).toThrowError(types_1.AppError);
    });
    (0, vitest_1.it)('covers schedule duplicate and availability conflict branches', async () => {
        const { buildApp } = await Promise.resolve().then(() => __importStar(require('../src/app')));
        const { app } = buildApp();
        const first = await (0, supertest_1.default)(app)
            .post('/calendar/schedule/slot-dupe')
            .set(auth('system', 'SYSTEM'))
            .send({
            executiveId: 'exe-1',
            ownerId: 'own-1',
            contractId: 'ct-1',
            auctionEndDate: '2026-02-16',
            tierOffsetDays: 1,
            tierDurationDays: 2
        });
        (0, vitest_1.expect)(first.status).toBe(201);
        const duplicate = await (0, supertest_1.default)(app)
            .post('/calendar/schedule/slot-dupe')
            .set(auth('system', 'SYSTEM'))
            .send({
            executiveId: 'exe-1',
            ownerId: 'own-1',
            contractId: 'ct-1',
            auctionEndDate: '2026-02-16',
            tierOffsetDays: 1,
            tierDurationDays: 2
        });
        (0, vitest_1.expect)(duplicate.status).toBe(409);
        const conflict = await (0, supertest_1.default)(app)
            .post('/calendar/executive/exe-1')
            .set(auth('exe-1', 'EXECUTIVE'))
            .send({ availability: [{ date: '2026-02-17', status: 'AVAILABLE' }] });
        (0, vitest_1.expect)(conflict.status).toBe(409);
    });
    (0, vitest_1.it)('covers getCalendar executive forbidden and cancellation error paths', async () => {
        const { buildApp } = await Promise.resolve().then(() => __importStar(require('../src/app')));
        const { app } = buildApp();
        const forbidden = await (0, supertest_1.default)(app)
            .get('/calendar/executive/exe-200')
            .set(auth('exe-201', 'EXECUTIVE'));
        (0, vitest_1.expect)(forbidden.status).toBe(403);
        const notFoundCancel = await (0, supertest_1.default)(app)
            .post('/calendar/schedule/missing/cancel')
            .set(auth('system', 'SYSTEM'))
            .send({ nowDate: '2026-02-16' });
        (0, vitest_1.expect)(notFoundCancel.status).toBe(404);
        await (0, supertest_1.default)(app)
            .post('/calendar/schedule/slot-started/cancel')
            .set(auth('system', 'SYSTEM'))
            .send({ nowDate: '2026-02-16' });
        const scheduled = await (0, supertest_1.default)(app)
            .post('/calendar/schedule/slot-started')
            .set(auth('system', 'SYSTEM'))
            .send({
            executiveId: 'exe-90',
            ownerId: 'own-90',
            contractId: 'ct-90',
            auctionEndDate: '2026-02-16',
            tierOffsetDays: 0,
            tierDurationDays: 1
        });
        (0, vitest_1.expect)(scheduled.status).toBe(201);
        const startedCancel = await (0, supertest_1.default)(app)
            .post('/calendar/schedule/slot-started/cancel')
            .set(auth('system', 'SYSTEM'))
            .send({ nowDate: '2026-02-16' });
        (0, vitest_1.expect)(startedCancel.status).toBe(409);
    });
    (0, vitest_1.it)('covers notification push forbidden and error handler internal branch', async () => {
        const { buildApp } = await Promise.resolve().then(() => __importStar(require('../src/app')));
        const { app } = buildApp();
        const forbiddenPush = await (0, supertest_1.default)(app)
            .post('/calendar/notify/u2')
            .set(auth('u2', 'OWNER'))
            .send({ notifications: [{ type: 'DEADLINE_ALERT', referenceId: 'ct', message: 'msg' }] });
        (0, vitest_1.expect)(forbiddenPush.status).toBe(403);
        const mockRes = {
            statusCode: 0,
            body: undefined,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.body = payload;
                return this;
            }
        };
        (0, calendarController_1.errorHandler)(new Error('unexpected'), {}, mockRes, {});
        (0, vitest_1.expect)(mockRes.statusCode).toBe(500);
        const mockResApp = {
            statusCode: 0,
            body: undefined,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.body = payload;
                return this;
            }
        };
        (0, calendarController_1.errorHandler)(new types_1.AppError('bad', 422), {}, mockResApp, {});
        (0, vitest_1.expect)(mockResApp.statusCode).toBe(422);
    });
    (0, vitest_1.it)('covers cron deadline alerts and scheduler bootstrap', async () => {
        const scheduleSpy = vitest_1.vi.fn((_, callback) => ({
            stop: vitest_1.vi.fn(),
            trigger: callback
        }));
        vitest_1.vi.doMock('node-cron', () => ({
            default: {
                schedule: scheduleSpy
            }
        }));
        const { buildApp, startCron } = await Promise.resolve().then(() => __importStar(require('../src/app')));
        const { context } = buildApp();
        await context.calendarService.scheduleAfterAuction({ userId: 'system', role: 'SYSTEM' }, 'slot-deadline', {
            executiveId: 'exe-d',
            ownerId: 'own-d',
            contractId: 'contract-pending',
            auctionEndDate: '2026-02-16',
            tierOffsetDays: 5,
            tierDurationDays: 1,
            contractDeadlineDate: '2026-02-25'
        });
        const deadline24 = await context.cronService.run(new Date('2026-02-24T03:00:00.000Z'));
        (0, vitest_1.expect)(deadline24.createdNotifications).toBe(2);
        const deadline1 = await context.cronService.run(new Date('2026-02-25T02:00:00.000Z'));
        (0, vitest_1.expect)(deadline1.createdNotifications).toBe(2);
        await context.cronService.run(new Date('2026-02-25T03:00:00.000Z'));
        const repos = context.txManager.getRepositories();
        const slot = await repos.slots.findBySlotId('slot-deadline');
        (0, vitest_1.expect)(slot?.status).toBe('IN_PROGRESS');
        const task = startCron(context.cronService);
        (0, vitest_1.expect)(scheduleSpy).toHaveBeenCalledWith('0 * * * *', vitest_1.expect.any(Function));
        await task.trigger();
    });
});
