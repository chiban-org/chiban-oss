import { and, eq, ne } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db, Tx } from '@/db/client'
import { applications, inspections, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { isProjectParty } from '@/features/access/queries'
import { isSuspended } from '@/features/appeals/suspension'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability, requireCapability } from '@/features/authz/capabilities'
import { queueCalendarPush } from '@/features/calendar/queuePush'
import { getInspectionSettings } from '@/features/inspections/inspectionSettings'
import type { InspectionSettingsBody } from '@/features/inspections/settingsSchema'
import { inspectionTypeLabel } from '@/features/inspections/siteInfo'
import { schedulingDates, slotStarts } from '@/features/inspections/slots'
import { PORTAL_PARTY_ROLES } from '@/features/inspections/types'
import { localToUtc, minutesToClock, utcToLocal } from '@/features/inspections/zonedTime'
import { INSPECTION_PARTY_ROLES, queueForParties } from '@/features/notifications/queue'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { getTownSettings } from '@/features/town/settings'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const UNIQUE_VIOLATION = '23505'
const MIN_OFF_GRID_REASON = 10
const MINUTES_PER_DAY = 1440

export interface ScheduleInput {
  inspectionId: string
  inspectorUserId: string
  date: CivilDate
  startMinute: number
  expectedRowVersion: number
  offGrid?: { reason: string }
}

export type ScheduleError =
  | 'not_found'
  | 'forbidden'
  | 'not_an_inspector'
  | 'not_schedulable'
  | 'date_unavailable'
  | 'slot_not_on_grid'
  | 'slot_taken'
  | 'inspector_full'
  | 'stale_version'
  | 'permit_suspended'

export interface ScheduleDeps {
  now?: Date
}

interface Rules {
  settings: InspectionSettingsBody
  today: CivilDate
  zone: string
  openDates: ReadonlySet<string>
  grid: ReadonlySet<number>
}

async function loadRules(db: Db, now: Date, signal: AbortSignal): Promise<Rules> {
  const settings = await getInspectionSettings(db, signal)
  const today = await townToday(db, now, signal)
  const town = await getTownSettings(db, signal)
  return {
    settings,
    today,
    zone: town.ok ? town.value.timeZone : 'America/New_York',
    openDates: new Set(schedulingDates(settings, packHolidayCalendar(), today)),
    grid: new Set(slotStarts(settings)),
  }
}

function slotError(input: ScheduleInput, rules: Rules): ScheduleError | null {
  const offGrid = (input.offGrid?.reason.trim().length ?? 0) >= MIN_OFF_GRID_REASON
  const fits =
    input.startMinute >= 0 && input.startMinute + rules.settings.slotMinutes <= MINUTES_PER_DAY
  const real = utcToLocal(localToUtc(input.date, input.startMinute, rules.zone), rules.zone)
  const valid = fits && real.date === input.date && real.minute === input.startMinute
  if (!offGrid) {
    if (!rules.openDates.has(input.date)) return 'date_unavailable'
    return rules.grid.has(input.startMinute) ? null : 'slot_not_on_grid'
  }
  if (input.date < rules.today) return 'date_unavailable'
  return valid ? null : 'slot_not_on_grid'
}

function isUniqueViolation(e: unknown): boolean {
  const cause = (e as { cause?: { code?: string } }).cause
  return cause?.code === UNIQUE_VIOLATION
}

async function queueBookingPushes(
  tx: Tx,
  locked: typeof inspections.$inferSelect,
  input: ScheduleInput,
  sequence: number,
  rules: Rules,
  signal: AbortSignal,
): Promise<string[]> {
  const pushIds: string[] = []
  const previousInspector = locked.inspectorUserId
  const handedOver =
    locked.status === 'scheduled' &&
    previousInspector !== null &&
    previousInspector !== input.inspectorUserId
  if (handedOver) {
    const cancelId = await queueCalendarPush(
      tx,
      {
        inspectionId: input.inspectionId,
        sequence: locked.calendarSequence,
        op: 'cancel',
        inspectorUserId: previousInspector,
        slot: {
          date: locked.scheduledDate ?? input.date,
          startMinute: locked.startMinute ?? input.startMinute,
          durationMinutes: locked.durationMinutes ?? rules.settings.slotMinutes,
        },
      },
      signal,
    )
    if (cancelId !== null) pushIds.push(cancelId)
  }
  const publishId = await queueCalendarPush(
    tx,
    {
      inspectionId: input.inspectionId,
      sequence,
      op: 'publish',
      inspectorUserId: input.inspectorUserId,
    },
    signal,
  )
  if (publishId !== null) pushIds.push(publishId)
  return pushIds
}

function bookingConflict(
  booked: { startMinute: number | null; durationMinutes: number | null }[],
  input: ScheduleInput,
  rules: Rules,
): 'inspector_full' | 'slot_taken' | null {
  if (booked.length >= rules.settings.maxPerInspectorPerDay) return 'inspector_full'
  const overlaps = booked.some(
    (b) =>
      b.startMinute !== null &&
      b.durationMinutes !== null &&
      input.startMinute < b.startMinute + b.durationMinutes &&
      b.startMinute < input.startMinute + rules.settings.slotMinutes,
  )
  return overlaps ? 'slot_taken' : null
}

async function bookInTransaction(
  tx: Tx,
  actor: Actor,
  input: ScheduleInput,
  rules: Rules,
  signal: AbortSignal,
): Promise<Result<{ calendarSequence: number; pushIds: string[] }, ScheduleError>> {
  const [locked] = await tx
    .select()
    .from(inspections)
    .where(eq(inspections.id, input.inspectionId))
    .for('update')
  if (locked === undefined) return err('not_found')
  if (locked.rowVersion !== input.expectedRowVersion) return err('stale_version')
  if (locked.status !== 'requested' && locked.status !== 'scheduled') return err('not_schedulable')
  const [app] = await tx
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, locked.applicationId))
    .for('update')
  if (app?.state === 'suspended' || (await isSuspended(tx, locked.applicationId, signal))) {
    return err('permit_suspended')
  }
  if (app?.state !== 'issued') return err('not_schedulable')
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, input.inspectorUserId))
    .for('update')
  const booked = await tx
    .select({
      id: inspections.id,
      startMinute: inspections.startMinute,
      durationMinutes: inspections.durationMinutes,
    })
    .from(inspections)
    .where(
      and(
        eq(inspections.inspectorUserId, input.inspectorUserId),
        eq(inspections.scheduledDate, input.date),
        eq(inspections.status, 'scheduled'),
        ne(inspections.id, input.inspectionId),
      ),
    )
  const conflict = bookingConflict(booked, input, rules)
  if (conflict !== null) return err(conflict)
  const wasScheduled = locked.status === 'scheduled'
  const sequence = wasScheduled ? locked.calendarSequence + 1 : locked.calendarSequence
  const offGridReason = input.offGrid?.reason.trim() ?? null
  const onGrid = rules.openDates.has(input.date) && rules.grid.has(input.startMinute)
  try {
    await tx
      .update(inspections)
      .set({
        status: 'scheduled',
        inspectorUserId: input.inspectorUserId,
        scheduledDate: input.date,
        startMinute: input.startMinute,
        durationMinutes: rules.settings.slotMinutes,
        calendarSequence: sequence,
        offGridReason: onGrid ? null : offGridReason,
        rowVersion: locked.rowVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(inspections.id, input.inspectionId))
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError(ErrorIds.INSP_SLOT_INVARIANT, 'slot index rejected a checked booking', {
        inspectionId: input.inspectionId,
      })
    }
    throw e
  }
  const pushIds = await queueBookingPushes(tx, locked, input, sequence, rules, signal)
  await queueForParties(
    tx,
    {
      event: 'inspection_scheduled',
      applicationId: locked.applicationId,
      discriminator: `${locked.id}:${sequence}`,
      extra: {
        inspectionLabel: inspectionTypeLabel(locked.inspectionType),
        onDate: formatCivilDate(input.date),
        atTime: minutesToClock(input.startMinute),
      },
      roles: INSPECTION_PARTY_ROLES,
    },
    signal,
  )
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'inspection.schedule',
      entityType: 'inspection',
      entityId: input.inspectionId,
      before: wasScheduled
        ? {
            inspectorUserId: locked.inspectorUserId,
            date: locked.scheduledDate,
            start: locked.startMinute,
          }
        : null,
      after: {
        inspectorUserId: input.inspectorUserId,
        date: input.date,
        startMinute: input.startMinute,
        offGridReason: onGrid ? null : offGridReason,
      },
    },
    signal,
  )
  return ok({ calendarSequence: sequence, pushIds })
}

export async function scheduleInspection(
  db: Db,
  actor: Actor,
  input: ScheduleInput,
  signal: AbortSignal,
  deps: ScheduleDeps = {},
): Promise<Result<{ calendarSequence: number; pushIds: string[] }, ScheduleError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'inspection.schedule', signal)
  if (!allowed.ok) return err('forbidden')
  const rules = await loadRules(db, deps.now ?? new Date(), signal)
  const [inspector] = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.id, input.inspectorUserId))
  const qualifies =
    inspector?.isActive === true &&
    (await hasCapability(db, input.inspectorUserId, 'inspection.record', signal))
  if (!qualifies) return err('not_an_inspector')
  const invalid = slotError(input, rules)
  if (invalid !== null) return err(invalid)
  return await transactionResult(db, (tx) => bookInTransaction(tx, actor, input, rules, signal))
}

export interface CancelInput {
  inspectionId: string
  reason: 'requester' | 'staff'
  expectedRowVersion: number
}

export type CancelError = 'not_found' | 'forbidden' | 'stale_version' | 'not_cancellable'

async function stillAParty(
  tx: Tx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const [app] = await tx
    .select({ projectId: applications.projectId })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return (
    app !== undefined &&
    (await isProjectParty(tx, actor, app.projectId, [...PORTAL_PARTY_ROLES], signal))
  )
}

export async function cancelInspection(
  db: Db,
  actor: Actor,
  input: CancelInput,
  signal: AbortSignal,
): Promise<Result<{ pushIds: string[] }, CancelError>> {
  signal.throwIfAborted()
  const isStaff = (await requireCapability(db, actor.userId, 'inspection.schedule', signal)).ok
  return await transactionResult(db, async (tx) => {
    const [locked] = await tx
      .select()
      .from(inspections)
      .where(eq(inspections.id, input.inspectionId))
      .for('update')
    if (locked === undefined) return err('not_found')
    const ownRequest = locked.channel === 'portal' && locked.requestedByUserId === actor.userId
    if (!isStaff && !(ownRequest && (await stillAParty(tx, actor, locked.applicationId, signal)))) {
      return err('not_found')
    }
    if (locked.rowVersion !== input.expectedRowVersion) return err('stale_version')
    if (locked.status !== 'requested' && locked.status !== 'scheduled')
      return err('not_cancellable')
    const pushIds: string[] = []
    if (locked.status === 'scheduled' && locked.inspectorUserId !== null) {
      const pushId = await queueCalendarPush(
        tx,
        {
          inspectionId: locked.id,
          sequence: locked.calendarSequence,
          op: 'cancel',
          inspectorUserId: locked.inspectorUserId,
        },
        signal,
      )
      if (pushId !== null) pushIds.push(pushId)
    }
    await tx
      .update(inspections)
      .set({
        status: 'cancelled',
        cancelReason: isStaff ? input.reason : 'requester',
        rowVersion: locked.rowVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(inspections.id, locked.id))
    await queueForParties(
      tx,
      {
        event: 'inspection_cancelled',
        applicationId: locked.applicationId,
        discriminator: `${locked.id}:cancelled`,
        extra: { inspectionLabel: inspectionTypeLabel(locked.inspectionType) },
        roles: INSPECTION_PARTY_ROLES,
      },
      signal,
    )
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'inspection.cancel',
        entityType: 'inspection',
        entityId: locked.id,
        before: { status: locked.status },
        after: { status: 'cancelled', reason: isStaff ? input.reason : 'requester' },
      },
      signal,
    )
    return ok({ pushIds })
  })
}
