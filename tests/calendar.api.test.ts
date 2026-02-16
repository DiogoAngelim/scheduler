import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

function auth(userId: string, role: 'EXECUTIVE' | 'OWNER' | 'SYSTEM') {
  return {
    'x-user-id': userId,
    'x-role': role
  };
}

describe('Calendar API', () => {
  it('creates and updates executive availability with daily granularity', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/calendar/executive/exe-1')
      .set(auth('exe-1', 'EXECUTIVE'))
      .send({
        availability: [
          { date: '2026-02-20', status: 'AVAILABLE' },
          { date: '2026-02-21', status: 'BLOCKED' },
          { date: '2026-02-20', status: 'BLOCKED' }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.timezone).toBe('America/Sao_Paulo');
    expect(response.body.availability).toEqual([
      { date: '2026-02-20', status: 'BLOCKED' },
      { date: '2026-02-21', status: 'BLOCKED' }
    ]);
  });

  it('enforces executive ownership on availability updates', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/calendar/executive/exe-2')
      .set(auth('exe-1', 'EXECUTIVE'))
      .send({ availability: [{ date: '2026-02-20', status: 'AVAILABLE' }] });

    expect(response.status).toBe(403);
  });

  it('schedules deterministic slot and creates meet link and notifications', async () => {
    const { app } = buildApp();

    const scheduled = await request(app)
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

    expect(scheduled.status).toBe(201);
    expect(scheduled.body.startDate).toBe('2026-02-18');
    expect(scheduled.body.endDate).toBe('2026-02-20');
    expect(scheduled.body.googleMeetLink).toContain('https://meet.google.com/');

    const calendar = await request(app)
      .get('/calendar/executive/exe-10')
      .set(auth('exe-10', 'EXECUTIVE'));

    expect(calendar.status).toBe(200);
    expect(calendar.body.scheduledSlots).toHaveLength(1);
    expect(calendar.body.calendar.availability.map((item: any) => item.date)).toEqual([
      '2026-02-18',
      '2026-02-19',
      '2026-02-20'
    ]);

    const ownerView = await request(app)
      .get('/calendar/executive/exe-10')
      .set(auth('owner-20', 'OWNER'));

    expect(ownerView.status).toBe(200);
    expect(ownerView.body.scheduledSlots).toHaveLength(1);

    const ownerNotifications = await request(app)
      .post('/calendar/notify/owner-20')
      .set(auth('owner-20', 'OWNER'))
      .send({});

    expect(ownerNotifications.status).toBe(200);
    expect(ownerNotifications.body).toHaveLength(1);
    expect(ownerNotifications.body[0].type).toBe('AUCTION_CLEARED');
  });

  it('rejects overlapping slots and unauthorized schedule attempts', async () => {
    const { app } = buildApp();

    const first = await request(app)
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

    expect(first.status).toBe(201);

    const overlap = await request(app)
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

    expect(overlap.status).toBe(409);

    const unauthorized = await request(app)
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

    expect(unauthorized.status).toBe(403);
  });

  it('pushes notifications from system and marks as read by owner only', async () => {
    const { app } = buildApp();

    const pushed = await request(app)
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

    expect(pushed.status).toBe(200);
    expect(pushed.body).toHaveLength(1);
    expect(pushed.body[0].read).toBe(false);

    const deniedRead = await request(app)
      .post('/calendar/notify/user-1')
      .set(auth('owner-2', 'OWNER'))
      .send({ markReadIds: [pushed.body[0].id] });

    expect(deniedRead.status).toBe(403);

    const markRead = await request(app)
      .post('/calendar/notify/user-1')
      .set(auth('user-1', 'OWNER'))
      .send({ markReadIds: [pushed.body[0].id] });

    expect(markRead.status).toBe(200);
    expect(markRead.body[0].read).toBe(true);
  });

  it('cancels before start and frees calendar for reinvestment logic trigger', async () => {
    const { app } = buildApp();

    const created = await request(app)
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

    expect(created.status).toBe(201);

    const canceled = await request(app)
      .post('/calendar/schedule/slot-cancel/cancel')
      .set(auth('system', 'SYSTEM'))
      .send({ nowDate: '2026-02-18' });

    expect(canceled.status).toBe(200);
    expect(canceled.body.status).toBe('CANCELED');

    const calendar = await request(app)
      .get('/calendar/executive/exe-50')
      .set(auth('exe-50', 'EXECUTIVE'));

    expect(calendar.body.calendar.availability.every((item: any) => item.status === 'AVAILABLE')).toBe(true);
  });
});
