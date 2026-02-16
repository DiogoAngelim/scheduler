export const BRAZIL_TIMEZONE = 'America/Sao_Paulo' as const;

export type UserRole = 'EXECUTIVE' | 'OWNER' | 'SYSTEM';

export type DailyBlockStatus = 'AVAILABLE' | 'BLOCKED';

export interface DailyBlock {
  date: string;
  status: DailyBlockStatus;
}

export interface ExecutiveCalendar {
  executiveId: string;
  availability: DailyBlock[];
  timezone: typeof BRAZIL_TIMEZONE;
  createdAt: Date;
  updatedAt: Date;
}

export type ScheduledSlotStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';

export interface ScheduledSlot {
  id: string;
  slotId: string;
  executiveId: string;
  ownerId: string;
  contractId: string;
  startDate: string;
  endDate: string;
  status: ScheduledSlotStatus;
  googleMeetLink: string;
  contractDeadlineDate?: string;
  createdAt: Date;
}

export type NotificationType = 'DEADLINE_ALERT' | 'MEETING_REMINDER' | 'AUCTION_CLEARED';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  referenceId: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

export interface AuthContext {
  userId: string;
  role: UserRole;
}

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}
