import { z } from 'zod';
import { AppError, BRAZIL_TIMEZONE, type AuthContext, type DailyBlock, type NotificationType, type ScheduledSlot } from '../domain/types';
import type { GoogleMeetProvider } from '../integrations/googleMeet';
import type { TransactionManager } from '../repositories/interfaces';
import { addDays, enumerateDates, normalizeDate, overlaps } from '../utils/date';

const availabilitySchema = z.array(
  z.object({
    date: z.string(),
    status: z.enum(['AVAILABLE', 'BLOCKED'])
  })
);

export interface ScheduleAfterAuctionInput {
  executiveId: string;
  ownerId: string;
  contractId: string;
  auctionEndDate: string;
  tierOffsetDays: number;
  tierDurationDays: number;
  contractDeadlineDate?: string;
}

export class CalendarService {
  constructor(private readonly txManager: TransactionManager, private readonly meetProvider: GoogleMeetProvider) { }

  async createOrUpdateAvailability(actor: AuthContext, executiveId: string, availabilityInput: DailyBlock[]) {
    if (actor.role !== 'EXECUTIVE' || actor.userId !== executiveId) {
      throw new AppError('Only executive can modify own availability', 403);
    }

    const availability = availabilitySchema.parse(availabilityInput).map((entry) => ({
      date: normalizeDate(entry.date),
      status: entry.status
    }));

    const byDate = new Map<string, 'AVAILABLE' | 'BLOCKED'>();
    for (const block of availability) {
      byDate.set(block.date, block.status);
    }

    return this.txManager.runInTransaction(async (repos) => {
      const scheduledSlots = await repos.slots.listByExecutiveId(executiveId);
      const occupiedDates = new Set<string>();

      for (const slot of scheduledSlots.filter((slot) => slot.status !== 'CANCELED')) {
        for (const date of enumerateDates(slot.startDate, slot.endDate)) {
          occupiedDates.add(date);
        }
      }

      for (const [date, status] of byDate.entries()) {
        if (status === 'AVAILABLE' && occupiedDates.has(date)) {
          throw new AppError(`Cannot mark date ${date} as AVAILABLE, it is already scheduled`, 409);
        }
      }

      return repos.calendars.upsertCalendar({
        executiveId,
        availability: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, status]) => ({ date, status })),
        timezone: BRAZIL_TIMEZONE
      });
    });
  }

  async getCalendar(actor: AuthContext, executiveId: string) {
    if (actor.role === 'EXECUTIVE' && actor.userId !== executiveId) {
      throw new AppError('Executive can only view own calendar', 403);
    }

    return this.txManager.runInTransaction(async (repos) => {
      const calendar =
        (await repos.calendars.getByExecutiveId(executiveId)) ??
        ({ executiveId, availability: [], timezone: BRAZIL_TIMEZONE, createdAt: new Date(), updatedAt: new Date() } as const);

      let scheduledSlots: ScheduledSlot[] = [];
      if (actor.role === 'OWNER') {
        scheduledSlots = (await repos.slots.listByOwnerId(actor.userId)).filter((slot) => slot.executiveId === executiveId);
      } else {
        scheduledSlots = await repos.slots.listByExecutiveId(executiveId);
      }

      return { calendar, scheduledSlots };
    });
  }

  async scheduleAfterAuction(actor: AuthContext, slotId: string, input: ScheduleAfterAuctionInput) {
    if (actor.role !== 'SYSTEM') {
      throw new AppError('Only system can trigger scheduling', 403);
    }

    const auctionEndDate = normalizeDate(input.auctionEndDate);
    const startDate = addDays(auctionEndDate, input.tierOffsetDays);
    const endDate = addDays(startDate, input.tierDurationDays - 1);
    const contractDeadlineDate = input.contractDeadlineDate ? normalizeDate(input.contractDeadlineDate) : undefined;

    return this.txManager.runInTransaction(async (repos) => {
      const existingSlot = await repos.slots.findBySlotId(slotId);
      if (existingSlot) {
        throw new AppError(`Slot ${slotId} is already scheduled`, 409);
      }

      const executiveSlots = await repos.slots.listByExecutiveId(input.executiveId);
      const activeSlots = executiveSlots.filter((slot) => slot.status !== 'CANCELED' && slot.status !== 'COMPLETED');
      if (activeSlots.some((slot) => overlaps(startDate, endDate, slot.startDate, slot.endDate))) {
        throw new AppError('Slot overlaps with existing executive schedule', 409);
      }

      const googleMeetLink = await this.meetProvider.createMeeting({
        slotId,
        executiveId: input.executiveId,
        ownerId: input.ownerId
      });

      const created = await repos.slots.create({
        slotId,
        executiveId: input.executiveId,
        ownerId: input.ownerId,
        contractId: input.contractId,
        startDate,
        endDate,
        status: 'SCHEDULED',
        googleMeetLink,
        contractDeadlineDate
      });

      const currentCalendar =
        (await repos.calendars.getByExecutiveId(input.executiveId)) ??
        ({
          executiveId: input.executiveId,
          availability: [],
          timezone: BRAZIL_TIMEZONE,
          createdAt: new Date(),
          updatedAt: new Date()
        } as const);

      const blockedDates = new Set(currentCalendar.availability.filter((entry) => entry.status === 'BLOCKED').map((entry) => entry.date));
      for (const date of enumerateDates(startDate, endDate)) {
        blockedDates.add(date);
      }

      const availableDates = currentCalendar.availability
        .filter((entry) => entry.status === 'AVAILABLE' && !blockedDates.has(entry.date))
        .map((entry) => entry.date);

      const mergedAvailability = [...availableDates.map((date) => ({ date, status: 'AVAILABLE' as const })), ...[...blockedDates].map((date) => ({ date, status: 'BLOCKED' as const }))].sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      await repos.calendars.upsertCalendar({
        executiveId: input.executiveId,
        availability: mergedAvailability,
        timezone: BRAZIL_TIMEZONE
      });

      const notifications: Array<{ userId: string; type: NotificationType; referenceId: string; message: string }> = [
        {
          userId: input.ownerId,
          type: 'AUCTION_CLEARED',
          referenceId: slotId,
          message: `Auction cleared. Scheduled from ${startDate} to ${endDate}. Meeting: ${googleMeetLink}`
        },
        {
          userId: input.executiveId,
          type: 'AUCTION_CLEARED',
          referenceId: slotId,
          message: `New scheduled slot ${slotId} from ${startDate} to ${endDate}. Meeting: ${googleMeetLink}`
        }
      ];

      await repos.notifications.createMany(notifications);
      return created;
    });
  }

  async cancelBeforeStart(actor: AuthContext, slotId: string, nowDate: string) {
    if (actor.role !== 'SYSTEM') {
      throw new AppError('Only system can cancel scheduled slots', 403);
    }

    const normalizedNowDate = normalizeDate(nowDate);

    return this.txManager.runInTransaction(async (repos) => {
      const slot = await repos.slots.findBySlotId(slotId);
      if (!slot) {
        throw new AppError('Slot not found', 404);
      }

      if (slot.startDate <= normalizedNowDate) {
        throw new AppError('Cannot cancel slot that already started', 409);
      }

      const updated = await repos.slots.updateStatus(slotId, 'CANCELED');
      const executiveSlots = await repos.slots.listByExecutiveId(slot.executiveId);
      const stillBlocked = new Set(
        executiveSlots
          .filter((entry) => entry.status !== 'CANCELED' && entry.status !== 'COMPLETED')
          .flatMap((entry) => enumerateDates(entry.startDate, entry.endDate))
      );

      const calendar = await repos.calendars.getByExecutiveId(slot.executiveId);
      if (calendar) {
        const availability = calendar.availability
          .map((entry) => (stillBlocked.has(entry.date) ? { ...entry, status: 'BLOCKED' as const } : { ...entry, status: 'AVAILABLE' as const }))
          .sort((a, b) => a.date.localeCompare(b.date));

        await repos.calendars.upsertCalendar({
          executiveId: slot.executiveId,
          availability,
          timezone: BRAZIL_TIMEZONE
        });
      }

      await repos.notifications.createMany([
        {
          userId: slot.ownerId,
          type: 'DEADLINE_ALERT',
          referenceId: slot.slotId,
          message: `Slot ${slot.slotId} canceled before start; reinvestment pool trigger should run.`
        }
      ]);

      return updated;
    });
  }
}
