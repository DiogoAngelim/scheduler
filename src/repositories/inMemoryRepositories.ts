import crypto from 'crypto';
import type { DailyBlock, ExecutiveCalendar, Notification, NotificationType, ScheduledSlot, ScheduledSlotStatus } from '../domain/types';
import type {
  CalendarRepository,
  NotificationRepository,
  RepositoryBundle,
  ScheduledSlotRepository,
  TransactionManager
} from './interfaces';

interface InMemoryState {
  calendars: Map<string, ExecutiveCalendar>;
  slots: Map<string, ScheduledSlot>;
  notifications: Map<string, Notification>;
}

function deepCloneState(state: InMemoryState): InMemoryState {
  return {
    calendars: new Map([...state.calendars.entries()].map(([k, v]) => [k, { ...v, availability: v.availability.map((a) => ({ ...a })) }])),
    slots: new Map([...state.slots.entries()].map(([k, v]) => [k, { ...v }])),
    notifications: new Map([...state.notifications.entries()].map(([k, v]) => [k, { ...v }]))
  };
}

class InMemoryCalendarRepository implements CalendarRepository {
  constructor(private readonly state: InMemoryState) { }

  async getByExecutiveId(executiveId: string): Promise<ExecutiveCalendar | undefined> {
    const existing = this.state.calendars.get(executiveId);
    return existing ? { ...existing, availability: existing.availability.map((a) => ({ ...a })) } : undefined;
  }

  async upsertCalendar(input: {
    executiveId: string;
    availability: DailyBlock[];
    timezone: 'America/Sao_Paulo';
  }): Promise<ExecutiveCalendar> {
    const now = new Date();
    const current = this.state.calendars.get(input.executiveId);
    const payload: ExecutiveCalendar = {
      executiveId: input.executiveId,
      availability: input.availability.map((a) => ({ ...a })),
      timezone: input.timezone,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };

    this.state.calendars.set(input.executiveId, payload);
    return { ...payload, availability: payload.availability.map((a) => ({ ...a })) };
  }
}

class InMemoryScheduledSlotRepository implements ScheduledSlotRepository {
  constructor(private readonly state: InMemoryState) { }

  async create(slot: Omit<ScheduledSlot, 'id' | 'createdAt'>): Promise<ScheduledSlot> {
    const id = crypto.randomUUID();
    const createdAt = new Date();
    const value: ScheduledSlot = { ...slot, id, createdAt };
    this.state.slots.set(id, value);
    return { ...value };
  }

  async findBySlotId(slotId: string): Promise<ScheduledSlot | undefined> {
    const found = [...this.state.slots.values()].find((slot) => slot.slotId === slotId);
    return found ? { ...found } : undefined;
  }

  async listByExecutiveId(executiveId: string): Promise<ScheduledSlot[]> {
    return [...this.state.slots.values()].filter((slot) => slot.executiveId === executiveId).map((slot) => ({ ...slot }));
  }

  async listByOwnerId(ownerId: string): Promise<ScheduledSlot[]> {
    return [...this.state.slots.values()].filter((slot) => slot.ownerId === ownerId).map((slot) => ({ ...slot }));
  }

  async listAll(): Promise<ScheduledSlot[]> {
    return [...this.state.slots.values()].map((slot) => ({ ...slot }));
  }

  async updateStatus(slotId: string, status: ScheduledSlotStatus): Promise<ScheduledSlot | undefined> {
    const slot = [...this.state.slots.values()].find((entry) => entry.slotId === slotId);
    if (!slot) {
      return undefined;
    }

    const updated: ScheduledSlot = { ...slot, status };
    this.state.slots.set(slot.id, updated);
    return { ...updated };
  }
}

class InMemoryNotificationRepository implements NotificationRepository {
  constructor(private readonly state: InMemoryState) { }

  async createMany(notifications: Omit<Notification, 'id' | 'createdAt' | 'read'>[]): Promise<Notification[]> {
    const createdAt = new Date();
    const created = notifications.map((item) => {
      const entry: Notification = {
        ...item,
        id: crypto.randomUUID(),
        read: false,
        createdAt
      };
      this.state.notifications.set(entry.id, entry);
      return { ...entry };
    });

    return created;
  }

  async listByUserId(userId: string): Promise<Notification[]> {
    return [...this.state.notifications.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((item) => ({ ...item }));
  }

  async listAll(): Promise<Notification[]> {
    return [...this.state.notifications.values()].map((item) => ({ ...item }));
  }

  async markRead(userId: string, notificationIds: string[]): Promise<number> {
    let count = 0;
    for (const id of notificationIds) {
      const existing = this.state.notifications.get(id);
      if (existing && existing.userId === userId && !existing.read) {
        this.state.notifications.set(id, { ...existing, read: true });
        count += 1;
      }
    }

    return count;
  }

  async existsBySignature(input: { userId: string; type: NotificationType; referenceId: string; message: string }): Promise<boolean> {
    return [...this.state.notifications.values()].some(
      (item) =>
        item.userId === input.userId &&
        item.type === input.type &&
        item.referenceId === input.referenceId &&
        item.message === input.message
    );
  }
}

export class InMemoryTransactionManager implements TransactionManager {
  private state: InMemoryState = {
    calendars: new Map<string, ExecutiveCalendar>(),
    slots: new Map<string, ScheduledSlot>(),
    notifications: new Map<string, Notification>()
  };

  private createBundle(state: InMemoryState): RepositoryBundle {
    return {
      calendars: new InMemoryCalendarRepository(state),
      slots: new InMemoryScheduledSlotRepository(state),
      notifications: new InMemoryNotificationRepository(state)
    };
  }

  async runInTransaction<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T> {
    const snapshot = deepCloneState(this.state);

    try {
      const result = await work(this.createBundle(snapshot));
      this.state = snapshot;
      return result;
    } catch (error) {
      throw error;
    }
  }

  getRepositories(): RepositoryBundle {
    return this.createBundle(this.state);
  }
}
