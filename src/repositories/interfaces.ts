import type { DailyBlock, ExecutiveCalendar, Notification, NotificationType, ScheduledSlot, ScheduledSlotStatus } from '../domain/types';

export interface CalendarRepository {
  getByExecutiveId(executiveId: string): Promise<ExecutiveCalendar | undefined>;
  upsertCalendar(input: { executiveId: string; availability: DailyBlock[]; timezone: 'America/Sao_Paulo' }): Promise<ExecutiveCalendar>;
}

export interface ScheduledSlotRepository {
  create(slot: Omit<ScheduledSlot, 'id' | 'createdAt'>): Promise<ScheduledSlot>;
  findBySlotId(slotId: string): Promise<ScheduledSlot | undefined>;
  listByExecutiveId(executiveId: string): Promise<ScheduledSlot[]>;
  listByOwnerId(ownerId: string): Promise<ScheduledSlot[]>;
  listAll(): Promise<ScheduledSlot[]>;
  updateStatus(slotId: string, status: ScheduledSlotStatus): Promise<ScheduledSlot | undefined>;
}

export interface NotificationRepository {
  createMany(notifications: Omit<Notification, 'id' | 'createdAt' | 'read'>[]): Promise<Notification[]>;
  listByUserId(userId: string): Promise<Notification[]>;
  listAll(): Promise<Notification[]>;
  markRead(userId: string, notificationIds: string[]): Promise<number>;
  existsBySignature(input: { userId: string; type: NotificationType; referenceId: string; message: string }): Promise<boolean>;
}

export interface RepositoryBundle {
  calendars: CalendarRepository;
  slots: ScheduledSlotRepository;
  notifications: NotificationRepository;
}

export interface TransactionManager {
  runInTransaction<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T>;
}
