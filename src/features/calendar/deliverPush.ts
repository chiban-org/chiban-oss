import { and, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm'
import { env } from '@/config/env'
import type { DbOrTx } from '@/db/client'
import {
  type CalendarKind,
  type CalendarPushRow,
  calendarPushes,
  inspections,
  inspectorCalendars,
  users,
} from '@/db/schema'
import type { CalendarBooking } from '@/features/calendar/ics'
import type { CalendarError, CalendarPublisher } from '@/features/calendar/publisher'
import { MAX_PUSH_ATTEMPTS } from '@/features/calendar/queuePush'
import { inspectionTypeLabel, loadSiteInfo } from '@/features/inspections/siteInfo'
import { localToUtc } from '@/features/inspections/zonedTime'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface DeliverDeps {
  publisherFor(kind: CalendarKind): CalendarPublisher
  now: Date
}

export type DeliverOutcome = 'sent' | 'superseded' | 'skipped'

const MS_PER_MINUTE = 60_000

async function markSent(
  db: DbOrTx,
  push: CalendarPushRow,
  now: Date,
  externalRef: string | null,
): Promise<void> {
  await db
    .update(calendarPushes)
    .set({ status: 'sent', sentAt: now, externalRef })
    .where(eq(calendarPushes.id, push.id))
}

async function recordFailure(
  db: DbOrTx,
  push: CalendarPushRow,
  error: CalendarError,
): Promise<void> {
  const attempts = push.attempts + 1
  await db
    .update(calendarPushes)
    .set({
      attempts,
      lastError: error.detail,
      status: attempts >= MAX_PUSH_ATTEMPTS ? 'failed' : 'queued',
    })
    .where(eq(calendarPushes.id, push.id))
}

async function previousRefFor(db: DbOrTx, push: CalendarPushRow): Promise<string | null> {
  const [latest] = await db
    .select({ ref: calendarPushes.externalRef, createdAt: calendarPushes.createdAt })
    .from(calendarPushes)
    .where(
      and(
        eq(calendarPushes.inspectionId, push.inspectionId),
        eq(calendarPushes.inspectorUserId, push.inspectorUserId),
        eq(calendarPushes.status, 'sent'),
        eq(calendarPushes.op, 'publish'),
        isNotNull(calendarPushes.externalRef),
      ),
    )
    .orderBy(desc(calendarPushes.sentAt), desc(calendarPushes.createdAt))
    .limit(1)
  const [cancelledSince] = await db
    .select({ id: calendarPushes.id })
    .from(calendarPushes)
    .where(
      and(
        eq(calendarPushes.inspectionId, push.inspectionId),
        eq(calendarPushes.inspectorUserId, push.inspectorUserId),
        eq(calendarPushes.status, 'sent'),
        eq(calendarPushes.op, 'cancel'),
        gt(calendarPushes.createdAt, latest?.createdAt ?? new Date(0)),
      ),
    )
    .limit(1)
  return cancelledSince === undefined ? (latest?.ref ?? null) : null
}

async function buildBooking(
  db: DbOrTx,
  push: CalendarPushRow,
  attendeeEmail: string,
  attendeeName: string,
  targetUserRef: string,
  now: Date,
  signal: AbortSignal,
): Promise<CalendarBooking | null> {
  const [inspection] = await db
    .select()
    .from(inspections)
    .where(eq(inspections.id, push.inspectionId))
  if (inspection === undefined) return null
  const site = await loadSiteInfo(db, inspection.applicationId, now, signal)
  if (site === null) return null
  const town = await getTownSettings(db, signal)
  const zone = town.ok ? town.value.timeZone : 'America/New_York'
  const startUtc = localToUtc(push.scheduledDate as CivilDate, push.startMinute, zone)
  const address =
    site.siteAddress.state === 'known' || site.siteAddress.state === 'stale'
      ? site.siteAddress.value
      : null
  const parcel = site.parcelDisplayId ?? 'unknown'
  const host = new URL(env.BASE_URL).host
  const description = [
    `Site: ${address ?? `Parcel ${parcel}`}`,
    `Parcel: ${parcel}`,
    `Permit: ${site.applicationNumber}`,
    `Date: ${formatCivilDate(push.scheduledDate)}`,
    `Contact: ${inspection.contactName}${inspection.contactPhone === null ? '' : `, ${inspection.contactPhone}`}`,
    ...(inspection.accessNotes === null ? [] : [`Access: ${inspection.accessNotes}`]),
    `${env.BASE_URL}/staff/inspections/${inspection.id}`,
  ].join('\n')
  return {
    uid: `inspection-${inspection.id}@${host}`,
    sequence: push.op === 'cancel' ? push.sequence + 1 : push.sequence,
    startUtc,
    endUtc: new Date(startUtc.getTime() + push.durationMinutes * MS_PER_MINUTE),
    summary: `${inspectionTypeLabel(inspection.inspectionType)} inspection, ${site.applicationNumber}`,
    description,
    location: address ?? `Parcel ${parcel}`,
    organizerEmail: env.MAIL_FROM,
    attendeeEmail,
    attendeeName,
    targetUserRef,
  }
}

async function rebookedSince(db: DbOrTx, push: CalendarPushRow): Promise<boolean> {
  const [later] = await db
    .select({ id: calendarPushes.id })
    .from(calendarPushes)
    .where(
      and(
        eq(calendarPushes.inspectionId, push.inspectionId),
        eq(calendarPushes.inspectorUserId, push.inspectorUserId),
        eq(calendarPushes.op, 'publish'),
        gt(calendarPushes.sequence, push.sequence),
        inArray(calendarPushes.status, ['queued', 'sent']),
      ),
    )
    .limit(1)
  return later !== undefined
}

async function isStale(db: DbOrTx, push: CalendarPushRow): Promise<boolean> {
  if (push.op === 'cancel') return await rebookedSince(db, push)
  const [inspection] = await db
    .select({
      sequence: inspections.calendarSequence,
      status: inspections.status,
      inspectorUserId: inspections.inspectorUserId,
    })
    .from(inspections)
    .where(eq(inspections.id, push.inspectionId))
  return (
    inspection === undefined ||
    inspection.status !== 'scheduled' ||
    inspection.inspectorUserId !== push.inspectorUserId ||
    push.sequence < inspection.sequence
  )
}

export async function deliverPush(
  db: DbOrTx,
  deps: DeliverDeps,
  pushId: string,
  signal: AbortSignal,
): Promise<Result<DeliverOutcome, CalendarError>> {
  signal.throwIfAborted()
  const [peek] = await db
    .select({ inspectionId: calendarPushes.inspectionId })
    .from(calendarPushes)
    .where(eq(calendarPushes.id, pushId))
  if (peek !== undefined) {
    await db.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`calendar:${peek.inspectionId}`}))`,
    )
  }
  const [claimed] = await db
    .select()
    .from(calendarPushes)
    .where(eq(calendarPushes.id, pushId))
    .for('update')
  if (claimed === undefined || claimed.status !== 'queued') return ok('skipped')
  if (await isStale(db, claimed)) {
    await markSent(db, claimed, deps.now, null)
    return ok('superseded')
  }
  const [calendar] = await db
    .select()
    .from(inspectorCalendars)
    .where(eq(inspectorCalendars.userId, claimed.inspectorUserId))
  const [account] = await db
    .select({ email: users.email, name: users.displayName, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, claimed.inspectorUserId))
  if (account?.isActive === false) {
    await markSent(db, claimed, deps.now, null)
    return ok('superseded')
  }
  if (account === undefined) {
    const error: CalendarError = { kind: 'rejected', detail: 'inspector account is gone' }
    await recordFailure(db, claimed, error)
    return err(error)
  }
  const booking = await buildBooking(
    db,
    claimed,
    calendar?.email ?? account.email,
    account.name,
    calendar?.graphUserId ?? calendar?.email ?? account.email,
    deps.now,
    signal,
  )
  if (booking === null) {
    const error: CalendarError = { kind: 'rejected', detail: 'booking could not be built' }
    await recordFailure(db, claimed, error)
    return err(error)
  }
  const publisher = deps.publisherFor(claimed.targetKind)
  const previousRef = await previousRefFor(db, claimed)
  if (claimed.op === 'cancel') {
    const cancelled = await publisher.cancel(booking, previousRef, signal)
    if (!cancelled.ok) {
      await recordFailure(db, claimed, cancelled.error)
      return err(cancelled.error)
    }
    await markSent(db, claimed, deps.now, null)
    return ok('sent')
  }
  const published = await publisher.publish(booking, previousRef, signal)
  if (!published.ok) {
    await recordFailure(db, claimed, published.error)
    return err(published.error)
  }
  await markSent(db, claimed, deps.now, published.value.externalRef)
  return ok('sent')
}
