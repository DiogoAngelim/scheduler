import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../domain/types';
import { requireAuth, type RequestWithAuth } from '../auth/rbac';
import { CalendarService } from '../services/calendarService';
import { NotificationService } from '../services/notificationService';

const availabilitySchema = z.object({
  availability: z.array(
    z.object({
      date: z.string(),
      status: z.enum(['AVAILABLE', 'BLOCKED'])
    })
  )
});

const scheduleSchema = z.object({
  executiveId: z.string().min(1),
  ownerId: z.string().min(1),
  contractId: z.string().min(1),
  auctionEndDate: z.string().min(10),
  tierOffsetDays: z.number().int().min(0),
  tierDurationDays: z.number().int().min(1),
  contractDeadlineDate: z.string().min(10).optional()
});

const notifySchema = z.object({
  notifications: z
    .array(
      z.object({
        type: z.enum(['DEADLINE_ALERT', 'MEETING_REMINDER', 'AUCTION_CLEARED']),
        referenceId: z.string().min(1),
        message: z.string().min(1)
      })
    )
    .optional(),
  markReadIds: z.array(z.string().uuid()).optional()
});

const cancelSchema = z.object({ nowDate: z.string().min(10) });

export function createCalendarRouter(calendarService: CalendarService, notificationService: NotificationService) {
  const router = Router();

  router.post('/calendar/executive/:id', async (req: RequestWithAuth, res, next) => {
    try {
      const auth = requireAuth(req);
      const payload = availabilitySchema.parse(req.body);
      const result = await calendarService.createOrUpdateAvailability(auth, req.params.id, payload.availability);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/calendar/executive/:id', async (req: RequestWithAuth, res, next) => {
    try {
      const auth = requireAuth(req);
      const result = await calendarService.getCalendar(auth, req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/calendar/schedule/:slotId', async (req: RequestWithAuth, res, next) => {
    try {
      const auth = requireAuth(req);
      const payload = scheduleSchema.parse(req.body);
      const result = await calendarService.scheduleAfterAuction(auth, req.params.slotId, payload);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/calendar/notify/:userId', async (req: RequestWithAuth, res, next) => {
    try {
      const auth = requireAuth(req);
      const payload = notifySchema.parse(req.body);
      const result = await notificationService.pushOrRead(auth, req.params.userId, payload);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/calendar/schedule/:slotId/cancel', async (req: RequestWithAuth, res, next) => {
    try {
      const auth = requireAuth(req);
      const payload = cancelSchema.parse(req.body);
      const result = await calendarService.cancelBeforeStart(auth, req.params.slotId, payload.nowDate);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function errorHandler(err: unknown, _req: RequestWithAuth, res: any, _next: any) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: err.issues.map((issue) => issue.message).join('; ') });
  }

  return res.status(500).json({ error: 'Internal server error' });
}
