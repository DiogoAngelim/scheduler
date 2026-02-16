import { jsonb, pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';

export const executiveCalendars = pgTable('executive_calendars', {
  executiveId: text('executive_id').primaryKey(),
  availability: jsonb('availability').notNull(),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const scheduledSlots = pgTable('scheduled_slots', {
  id: uuid('id').primaryKey(),
  slotId: text('slot_id').notNull().unique(),
  executiveId: text('executive_id').notNull(),
  ownerId: text('owner_id').notNull(),
  contractId: text('contract_id').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  status: text('status').notNull(),
  googleMeetLink: text('google_meet_link').notNull(),
  contractDeadlineDate: text('contract_deadline_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  referenceId: text('reference_id').notNull(),
  message: text('message').notNull(),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
