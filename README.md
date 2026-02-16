# Scheduler API (Brazil-only Marketplace)

Backend API module for deterministic slot scheduling, executive calendar blocking, Google Meet generation, notifications, and contract deadline enforcement.

This project is implemented with:

- Node.js + TypeScript
- Express (REST)
- Drizzle ORM schema
- PostgreSQL adapter (production) + in-memory adapter (tests/dev fallback)
- Node cron for scheduled enforcement

Timezone is fixed to `America/Sao_Paulo` and scheduling is **daily granularity only** (no partial-day slots).

## Architecture

![Architecture](architectures.png)

## Table of Contents

- [Business Scope](#business-scope)
- [Core Rules](#core-rules)
- [Project Structure](#project-structure)
- [Domain Model](#domain-model)
- [Persistence and Transactions](#persistence-and-transactions)
- [Authentication and RBAC](#authentication-and-rbac)
- [API Reference](#api-reference)
- [Scheduling Lifecycle](#scheduling-lifecycle)
- [Cron Enforcement](#cron-enforcement)
- [Google Meet Integration](#google-meet-integration)
- [Configuration](#configuration)
- [Runbook](#runbook)
- [Testing and Quality](#testing-and-quality)
- [Known Notes](#known-notes)

## Business Scope

The module supports scheduling between marketplace participants after an auction clears.

Main responsibilities:

1. Manage executive availability in date blocks.
2. Deterministically schedule slots after auction clearance.
3. Block executive calendar dates automatically.
4. Create one Google Meet link per scheduled slot.
5. Send user notifications and reminders.
6. Enforce deadline-driven state transitions with cron.

## Core Rules

- Date precision is `YYYY-MM-DD` only.
- Timezone is constant: `America/Sao_Paulo`.
- No micro-scheduling: all availability and slots are day-based.
- Slot overlaps are forbidden per executive.
- All service-level state changes run inside one transaction.
- Notifications are immutable except for `read`.
- Scheduling/cancellation actions are system-only.

## Project Structure

```text
src/
  app.ts                       # App wiring + runtime adapter selection
  server.ts                    # HTTP server + cron startup + graceful shutdown
  auth/rbac.ts                # Header-based auth context + role checks
  controllers/calendarController.ts
  db/
    schema.ts                 # Drizzle table definitions
    client.ts                 # PostgreSQL pool + Drizzle client
  domain/types.ts             # Domain types and AppError
  integrations/
    googleMeet.ts             # Simulated meet provider
    contractGateway.ts        # Simulated contract resolution gateway
  repositories/
    interfaces.ts             # Repository and transaction contracts
    inMemoryRepositories.ts   # Deterministic adapter (tests/default)
    postgresRepositories.ts   # PostgreSQL adapter with Drizzle queries
  services/
    calendarService.ts
    notificationService.ts
    cronService.ts

tests/
  *.test.ts                   # API, service, branch and cron tests
```

## Domain Model

### ExecutiveCalendar

- `executiveId`
- `availability`: array of `{ date, status }` where status is `AVAILABLE | BLOCKED`
- `timezone` (always `America/Sao_Paulo`)
- `createdAt`, `updatedAt`

### ScheduledSlot

- `id` (UUID)
- `slotId` (unique business slot reference)
- `executiveId`, `ownerId`, `contractId`
- `startDate`, `endDate` (inclusive, day-level)
- `status`: `SCHEDULED | IN_PROGRESS | COMPLETED | CANCELED`
- `googleMeetLink`
- `contractDeadlineDate` (optional)
- `createdAt`

### Notification

- `id` (UUID)
- `userId`
- `type`: `DEADLINE_ALERT | MEETING_REMINDER | AUCTION_CLEARED`
- `referenceId` (slot or contract identifier)
- `message`
- `read`
- `createdAt`

## Persistence and Transactions

### Drizzle Schema

Table definitions are in `src/db/schema.ts`:

- `executive_calendars`
- `scheduled_slots`
- `notifications`

### Runtime Adapter Selection

`buildApp()` selects persistence by environment:

- If `DATABASE_URL` exists: PostgreSQL + Drizzle (`PgTransactionManager`)
- Otherwise: deterministic in-memory repositories (`InMemoryTransactionManager`)

### Transaction Model

Every mutating service operation is wrapped by `runInTransaction(...)`.

Examples:

- Scheduling: create slot + block calendar + create notifications (atomic)
- Cancellation: cancel slot + free calendar + notify owner (atomic)
- Cron enforcement: state updates + reminders (atomic per cron execution)

## Authentication and RBAC

Authentication is request-header based:

- `x-user-id: <string>`
- `x-role: EXECUTIVE | OWNER | SYSTEM`

Access rules:

- Executive can only modify own availability.
- Executive can only view own executive calendar.
- Owner can only view scheduled slots tied to their ownership.
- Only `SYSTEM` can trigger scheduling/cancellation/notification push.
- User can mark own notifications read; `SYSTEM` can mark any.

## API Reference

Base URL: `http://localhost:3000`

All endpoints require auth headers.

### 1) Create/Update Executive Availability

`POST /calendar/executive/:id`

Request body:

```json
{
  "availability": [
    { "date": "2026-02-20", "status": "AVAILABLE" },
    { "date": "2026-02-21", "status": "BLOCKED" }
  ]
}
```

Behavior:

- Upserts calendar for the executive.
- De-duplicates by date (latest value wins before persistence).
- Rejects setting `AVAILABLE` on dates occupied by non-canceled scheduled slots.

### 2) Get Executive Calendar + Scheduled Slots

`GET /calendar/executive/:id`

Behavior:

- Returns calendar availability and visible scheduled slots.
- For owner role, only slots belonging to the owner are returned.

### 3) Schedule Slot After Auction Clearance

`POST /calendar/schedule/:slotId`

System-only endpoint.

Request body:

```json
{
  "executiveId": "exe-10",
  "ownerId": "owner-20",
  "contractId": "ct-1",
  "auctionEndDate": "2026-02-16",
  "tierOffsetDays": 2,
  "tierDurationDays": 3,
  "contractDeadlineDate": "2026-02-25"
}
```

Deterministic date computation:

- `startDate = auctionEndDate + tierOffsetDays`
- `endDate = startDate + (tierDurationDays - 1)`

Behavior:

- Fails if slot already exists.
- Fails if overlaps with active (`SCHEDULED | IN_PROGRESS`) executive slots.
- Generates unique Google Meet link.
- Creates `ScheduledSlot` with status `SCHEDULED`.
- Blocks calendar dates.
- Creates `AUCTION_CLEARED` notifications for owner and executive.

### 4) Push Notifications / Mark as Read

`POST /calendar/notify/:userId`

Supports two operations in one endpoint:

1. Push notifications (system only)
2. Mark notifications as read (system or same user)

Request examples:

Push:

```json
{
  "notifications": [
    {
      "type": "DEADLINE_ALERT",
      "referenceId": "ct-99",
      "message": "Contract deadline in 24h"
    }
  ]
}
```

Mark read:

```json
{
  "markReadIds": ["8f865779-a6d4-45d0-8c87-a05722bcfca2"]
}
```

### 5) Cancel Scheduled Slot Before Start

`POST /calendar/schedule/:slotId/cancel`

System-only endpoint.

Request body:

```json
{
  "nowDate": "2026-02-18"
}
```

Behavior:

- Cancels only if slot exists and has not started.
- Frees calendar dates no longer blocked by other active slots.
- Creates owner notification mentioning reinvestment trigger path.

## Scheduling Lifecycle

### Status transitions

- `SCHEDULED` (on auction clear)
- `IN_PROGRESS` (when start day is reached)
- `COMPLETED` or `CANCELED` (deadline enforcement / cancellation)

### Overlap policy

No overlap is allowed for an executive across active slots.

### Calendar blocking policy

Each date in `[startDate, endDate]` is blocked; cancellation recalculates blocked dates from remaining active slots.

## Cron Enforcement

Cron setup (`src/app.ts`):

- Runs hourly: `0 * * * *`

Per execution (`CronService.run(now)`):

1. For each active slot (`SCHEDULED | IN_PROGRESS`), compute reference instants from Brazil day start.
2. Emit meeting reminders at 24h and 1h before slot start.
3. Emit deadline alerts at 24h and 1h before contract deadline.
4. De-duplicate reminders by signature (`userId`, `type`, `referenceId`, `message`).
5. Transition status to `IN_PROGRESS` at/after slot start.
6. At/after contract deadline, query contract gateway and set:
   - `COMPLETED` if resolved completed
   - `CANCELED` if resolved breached

## Google Meet Integration

Current implementation uses `SimulatedGoogleMeetProvider` (`src/integrations/googleMeet.ts`):

- Produces one unique link per scheduling operation.
- Link format follows Google Meet style.

To integrate real Google Calendar/Meet:

1. Implement `GoogleMeetProvider` with OAuth2 + Calendar API event creation.
2. Return generated meeting URL from provider.
3. Inject provider in `buildApp()`.

## Configuration

### Environment variables

- `PORT` (optional, default `3000`)
- `DATABASE_URL` (optional)
  - if set: PostgreSQL mode
  - if not set: in-memory mode
- `CRON_SCHEDULE` (optional, default `0 * * * *`)

Production guardrails:

- `NODE_ENV=production` requires `DATABASE_URL`.
- Invalid cron expressions fail fast at startup.
- Runtime provides unauthenticated health endpoints:
  - `GET /health/live`
  - `GET /health/ready`

### NPM scripts

- `npm run dev` → run from source via `tsx`
- `npm run build` → compile TypeScript to `dist/`
- `npm start` → run compiled server
- `npm test` → run tests with coverage

## Runbook

### Local development (in-memory)

```bash
npm install
npm run dev
```

### Local development (PostgreSQL)

```bash
export DATABASE_URL="postgres://user:pass@localhost:5432/scheduler"
npm run dev
```

### Production-like run

```bash
npm run build
npm start
```

### Graceful shutdown

On `SIGINT`/`SIGTERM`:

- cron task is stopped
- HTTP server closes
- PostgreSQL pool closes (when active)

## Testing and Quality

Test suite covers:

- API routes and RBAC
- Scheduling determinism and overlap enforcement
- Notification flows and mark-read permissions
- Cron reminders, deduplication, and status transitions
- Error branches and validation paths

Current baseline (latest run):

- 17 tests passing
- high overall coverage (target >95% met in current setup)

## Known Notes

1. Google Meet integration is simulated by design in this repository.
2. Contract completion/breach is simulated by `SimulatedContractGateway`.
3. Schema is defined in Drizzle, but migration files are not included yet.
4. Notification immutability is enforced by service/repository behavior; only `read` is mutable.

---

If you want, the next step can be adding:

- Drizzle migration files (`drizzle-kit`) and SQL migration workflow
- OpenAPI (`swagger`) generation for endpoint contracts
- Real Google Calendar integration implementation