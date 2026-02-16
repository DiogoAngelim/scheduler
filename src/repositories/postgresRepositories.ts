import crypto from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase, NodePgTransaction } from 'drizzle-orm/node-postgres';
import type { DailyBlock, ExecutiveCalendar, Notification, NotificationType, ScheduledSlot, ScheduledSlotStatus } from '../domain/types';
import { executiveCalendars, notifications, scheduledSlots } from '../db/schema';
import type {
  CalendarRepository,
  NotificationRepository,
  RepositoryBundle,
  ScheduledSlotRepository,
  TransactionManager
} from './interfaces';

type PgExecutor = NodePgDatabase<Record<string, never>> | NodePgTransaction<Record<string, never>, Record<string, never>>;

function normalizeCalendar(row: typeof executiveCalendars.$inferSelect): ExecutiveCalendar {
  return {
    executiveId: row.executiveId,
    availability: (row.availability as DailyBlock[]) ?? [],
    timezone: row.timezone as 'America/Sao_Paulo',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function normalizeSlot(row: typeof scheduledSlots.$inferSelect): ScheduledSlot {
  return {
    id: row.id,
    slotId: row.slotId,
    executiveId: row.executiveId,
    ownerId: row.ownerId,
    contractId: row.contractId,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status as ScheduledSlotStatus,
    googleMeetLink: row.googleMeetLink,
    contractDeadlineDate: row.contractDeadlineDate ?? undefined,
    createdAt: row.createdAt
  };
}

function normalizeNotification(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as NotificationType,
    referenceId: row.referenceId,
    message: row.message,
    read: row.read,
    createdAt: row.createdAt
  };
}

class PgCalendarRepository implements CalendarRepository {
  constructor(private readonly db: PgExecutor) { }

  async getByExecutiveId(executiveId: string): Promise<ExecutiveCalendar | undefined> {
    const [row] = await this.db.select().from(executiveCalendars).where(eq(executiveCalendars.executiveId, executiveId)).limit(1);
    return row ? normalizeCalendar(row) : undefined;
  }

  async upsertCalendar(input: {
    executiveId: string;
    availability: DailyBlock[];
    timezone: 'America/Sao_Paulo';
  }): Promise<ExecutiveCalendar> {
    const [row] = await this.db
      .insert(executiveCalendars)
      .values({
        executiveId: input.executiveId,
        availability: input.availability,
        timezone: input.timezone
      })
      .onConflictDoUpdate({
        target: executiveCalendars.executiveId,
        set: {
          availability: input.availability,
          timezone: input.timezone,
          updatedAt: new Date()
        }
      })
      .returning();

    return normalizeCalendar(row);
  }
}

class PgScheduledSlotRepository implements ScheduledSlotRepository {
  constructor(private readonly db: PgExecutor) { }

  async create(slot: Omit<ScheduledSlot, 'id' | 'createdAt'>): Promise<ScheduledSlot> {
    const [row] = await this.db
      .insert(scheduledSlots)
      .values({
        id: crypto.randomUUID(),
        slotId: slot.slotId,
        executiveId: slot.executiveId,
        ownerId: slot.ownerId,
        contractId: slot.contractId,
        startDate: slot.startDate,
        endDate: slot.endDate,
        status: slot.status,
        googleMeetLink: slot.googleMeetLink,
        contractDeadlineDate: slot.contractDeadlineDate ?? null
      })
      .returning();

    return normalizeSlot(row);
  }

  async findBySlotId(slotId: string): Promise<ScheduledSlot | undefined> {
    const [row] = await this.db.select().from(scheduledSlots).where(eq(scheduledSlots.slotId, slotId)).limit(1);
    return row ? normalizeSlot(row) : undefined;
  }

  async listByExecutiveId(executiveId: string): Promise<ScheduledSlot[]> {
    const rows = await this.db.select().from(scheduledSlots).where(eq(scheduledSlots.executiveId, executiveId));
    return rows.map(normalizeSlot);
  }

  async listByOwnerId(ownerId: string): Promise<ScheduledSlot[]> {
    const rows = await this.db.select().from(scheduledSlots).where(eq(scheduledSlots.ownerId, ownerId));
    return rows.map(normalizeSlot);
  }

  async listAll(): Promise<ScheduledSlot[]> {
    const rows = await this.db.select().from(scheduledSlots);
    return rows.map(normalizeSlot);
  }

  async updateStatus(slotId: string, status: ScheduledSlotStatus): Promise<ScheduledSlot | undefined> {
    const [row] = await this.db
      .update(scheduledSlots)
      .set({ status })
      .where(eq(scheduledSlots.slotId, slotId))
      .returning();

    return row ? normalizeSlot(row) : undefined;
  }
}

class PgNotificationRepository implements NotificationRepository {
  constructor(private readonly db: PgExecutor) { }

  async createMany(items: Omit<Notification, 'id' | 'createdAt' | 'read'>[]): Promise<Notification[]> {
    if (items.length === 0) {
      return [];
    }

    const rows = await this.db
      .insert(notifications)
      .values(items.map((item) => ({ ...item, id: crypto.randomUUID(), read: false })))
      .returning();

    return rows.map(normalizeNotification);
  }

  async listByUserId(userId: string): Promise<Notification[]> {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));

    return rows.map(normalizeNotification);
  }

  async listAll(): Promise<Notification[]> {
    const rows = await this.db.select().from(notifications);
    return rows.map(normalizeNotification);
  }

  async markRead(userId: string, notificationIds: string[]): Promise<number> {
    if (notificationIds.length === 0) {
      return 0;
    }

    const rows = await this.db
      .update(notifications)
      .set({ read: true })
      .where(
        and(eq(notifications.userId, userId), eq(notifications.read, false), inArray(notifications.id, notificationIds))
      );

    return rows.rowCount ?? 0;
  }

  async existsBySignature(input: { userId: string; type: NotificationType; referenceId: string; message: string }): Promise<boolean> {
    const [row] = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, input.userId),
          eq(notifications.type, input.type),
          eq(notifications.referenceId, input.referenceId),
          eq(notifications.message, input.message)
        )
      )
      .limit(1);

    return Boolean(row);
  }
}

export class PgTransactionManager implements TransactionManager {
  constructor(private readonly db: NodePgDatabase<Record<string, never>>) { }

  private createBundle(executor: PgExecutor): RepositoryBundle {
    return {
      calendars: new PgCalendarRepository(executor),
      slots: new PgScheduledSlotRepository(executor),
      notifications: new PgNotificationRepository(executor)
    };
  }

  async runInTransaction<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => work(this.createBundle(tx)));
  }

  getRepositories(): RepositoryBundle {
    return this.createBundle(this.db);
  }
}
