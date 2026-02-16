import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/domain/types';
import { errorHandler } from '../src/controllers/calendarController';
import { requireAuth } from '../src/auth/rbac';

function auth(userId: string, role: 'EXECUTIVE' | 'OWNER' | 'SYSTEM') {
  return {
    'x-user-id': userId,
    'x-role': role
  };
}

describe('Branch coverage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 401 for missing auth headers and 400 for zod validation', async () => {
    const { buildApp } = await import('../src/app');
    const { app } = buildApp();

    const noAuth = await request(app).get('/calendar/executive/exe-1');
    expect(noAuth.status).toBe(401);

    const invalidMarkRead = await request(app)
      .post('/calendar/notify/u1')
      .set(auth('u1', 'OWNER'))
      .send({ markReadIds: ['not-uuid'] });

    expect(invalidMarkRead.status).toBe(400);
  });

  it('throws unauthorized when auth context is absent', () => {
    expect(() => requireAuth({} as any)).toThrowError(AppError);
  });

  it('covers schedule duplicate and availability conflict branches', async () => {
    const { buildApp } = await import('../src/app');
    const { app } = buildApp();

    const first = await request(app)
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

    expect(first.status).toBe(201);

    const duplicate = await request(app)
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

    expect(duplicate.status).toBe(409);

    const conflict = await request(app)
      .post('/calendar/executive/exe-1')
      .set(auth('exe-1', 'EXECUTIVE'))
      .send({ availability: [{ date: '2026-02-17', status: 'AVAILABLE' }] });

    expect(conflict.status).toBe(409);
  });

  it('covers getCalendar executive forbidden and cancellation error paths', async () => {
    const { buildApp } = await import('../src/app');
    const { app } = buildApp();

    const forbidden = await request(app)
      .get('/calendar/executive/exe-200')
      .set(auth('exe-201', 'EXECUTIVE'));

    expect(forbidden.status).toBe(403);

    const notFoundCancel = await request(app)
      .post('/calendar/schedule/missing/cancel')
      .set(auth('system', 'SYSTEM'))
      .send({ nowDate: '2026-02-16' });

    expect(notFoundCancel.status).toBe(404);

    await request(app)
      .post('/calendar/schedule/slot-started/cancel')
      .set(auth('system', 'SYSTEM'))
      .send({ nowDate: '2026-02-16' });

    const scheduled = await request(app)
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

    expect(scheduled.status).toBe(201);

    const startedCancel = await request(app)
      .post('/calendar/schedule/slot-started/cancel')
      .set(auth('system', 'SYSTEM'))
      .send({ nowDate: '2026-02-16' });

    expect(startedCancel.status).toBe(409);
  });

  it('covers notification push forbidden and error handler internal branch', async () => {
    const { buildApp } = await import('../src/app');
    const { app } = buildApp();

    const forbiddenPush = await request(app)
      .post('/calendar/notify/u2')
      .set(auth('u2', 'OWNER'))
      .send({ notifications: [{ type: 'DEADLINE_ALERT', referenceId: 'ct', message: 'msg' }] });

    expect(forbiddenPush.status).toBe(403);

    const mockRes: any = {
      statusCode: 0,
      body: undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      }
    };

    errorHandler(new Error('unexpected'), {} as any, mockRes, {} as any);
    expect(mockRes.statusCode).toBe(500);

    const mockResApp: any = {
      statusCode: 0,
      body: undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      }
    };

    errorHandler(new AppError('bad', 422), {} as any, mockResApp, {} as any);
    expect(mockResApp.statusCode).toBe(422);
  });

  it('covers cron deadline alerts and scheduler bootstrap', async () => {
    const scheduleSpy = vi.fn((_: string, callback: () => Promise<void>) => ({
      stop: vi.fn(),
      trigger: callback
    }));

    vi.doMock('node-cron', () => ({
      default: {
        validate: vi.fn(() => true),
        schedule: scheduleSpy
      }
    }));

    const { buildApp, startCron } = await import('../src/app');
    const { context } = buildApp();

    await context.calendarService.scheduleAfterAuction(
      { userId: 'system', role: 'SYSTEM' },
      'slot-deadline',
      {
        executiveId: 'exe-d',
        ownerId: 'own-d',
        contractId: 'contract-pending',
        auctionEndDate: '2026-02-16',
        tierOffsetDays: 5,
        tierDurationDays: 1,
        contractDeadlineDate: '2026-02-25'
      }
    );

    const deadline24 = await context.cronService.run(new Date('2026-02-24T03:00:00.000Z'));
    expect(deadline24.createdNotifications).toBe(2);

    const deadline1 = await context.cronService.run(new Date('2026-02-25T02:00:00.000Z'));
    expect(deadline1.createdNotifications).toBe(2);

    await context.cronService.run(new Date('2026-02-25T03:00:00.000Z'));
    const repos = context.txManager.getRepositories();
    const slot = await repos.slots.findBySlotId('slot-deadline');
    expect(slot?.status).toBe('IN_PROGRESS');

    const task: any = startCron(context.cronService, '0 0 * * *');
    expect(scheduleSpy).toHaveBeenCalledWith('0 0 * * *', expect.any(Function));
    await task.trigger();
  });

  it('exposes liveness and readiness endpoints without auth', async () => {
    const { buildApp } = await import('../src/app');
    const { app } = buildApp();

    const live = await request(app).get('/health/live');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('ok');

    const ready = await request(app).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ready');
  });

  it('rejects invalid cron expression', async () => {
    vi.doMock('node-cron', () => ({
      default: {
        validate: vi.fn(() => false),
        schedule: vi.fn()
      }
    }));

    const { buildApp, startCron } = await import('../src/app');
    const { context } = buildApp();

    expect(() => startCron(context.cronService, 'invalid cron')).toThrow();
  });
});
