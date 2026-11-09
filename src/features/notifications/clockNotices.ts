import { and, eq, gte, inArray, lte, notInArray, type SQL, sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
  applications,
  clocks,
  notificationOutbox,
  roleCapabilities,
  userRoles,
  users,
} from '@/db/schema'
import { FULL_RECORD_ROLES } from '@/features/access/roles'
import type { CoreState } from '@/features/applications/states'
import { queueNotification } from '@/features/notifications/queue'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { WARNING_DAYS } from '@/features/queue/workQueue'
import { addDays, type CivilDate } from '@/types/civilDate'

export type ClockNoticeEvent = 'clock_due_soon' | 'clock_overdue'

export interface NoticeClock {
  id: string
  applicationId: string
  ruleKey: string
  ruleVersion: number
  currentDue: string
}

export function isActionDue(clock: Pick<NoticeClock, 'ruleKey' | 'ruleVersion'>): boolean {
  const rule = ruleByKey(loadPack(), clock.ruleKey, clock.ruleVersion)
  return rule.kind === 'clock' && rule.clockType === 'action_due'
}

function clockLabel(clock: NoticeClock): string {
  return ruleByKey(loadPack(), clock.ruleKey, clock.ruleVersion).label
}

function discriminatorOf(clock: NoticeClock): string {
  return `clock:${clock.id}:${clock.currentDue}`
}

async function alreadyQueued(tx: Tx, event: ClockNoticeEvent, clock: NoticeClock) {
  const [found] = await tx
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.event, event),
        eq(notificationOutbox.applicationId, clock.applicationId),
        sql`${notificationOutbox.payload}->>'discriminator' = ${discriminatorOf(clock)}`,
      ),
    )
    .limit(1)
  return found !== undefined
}

async function applicationManagers(tx: Tx): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roleCapabilities, eq(roleCapabilities.role, userRoles.role))
    .where(and(eq(users.isActive, true), eq(roleCapabilities.capability, 'application.manage')))
  return rows.map((r) => r.id)
}

function staffResolver(tx: Tx): (applicationId: string) => Promise<string[]> {
  let managers: Promise<string[]> | null = null
  return async (applicationId) => {
    const [staff] = await tx
      .select({ id: users.id })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.responsibleUserId))
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(
        and(
          eq(applications.id, applicationId),
          eq(users.isActive, true),
          inArray(userRoles.role, [...FULL_RECORD_ROLES]),
        ),
      )
      .limit(1)
    if (staff !== undefined) return [staff.id]
    managers ??= applicationManagers(tx)
    return await managers
  }
}

async function queueClockNotices(
  tx: Tx,
  input: { event: ClockNoticeEvent; clocks: readonly NoticeClock[] },
  signal: AbortSignal,
): Promise<void> {
  const staffFor = staffResolver(tx)
  for (const clock of input.clocks) {
    if (await alreadyQueued(tx, input.event, clock)) continue
    await queueNotification(
      tx,
      {
        event: input.event,
        applicationId: clock.applicationId,
        recipientUserIds: await staffFor(clock.applicationId),
        discriminator: discriminatorOf(clock),
        extra: { clockLabel: clockLabel(clock), dueOn: clock.currentDue },
      },
      signal,
    )
  }
}

const FINISHED_STATES: readonly CoreState[] = ['closed', 'withdrawn', 'expired']

const OPEN_APPLICATION = notInArray(applications.state, [...FINISHED_STATES])

async function noticeClocks(tx: Tx, where: SQL | undefined): Promise<NoticeClock[]> {
  return await tx
    .select({
      id: clocks.id,
      applicationId: clocks.applicationId,
      ruleKey: clocks.ruleKey,
      ruleVersion: clocks.ruleVersion,
      currentDue: clocks.currentDue,
    })
    .from(clocks)
    .innerJoin(applications, eq(applications.id, clocks.applicationId))
    .where(and(where, OPEN_APPLICATION))
}

export async function warnClocksDueSoon(
  tx: Tx,
  today: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  const soon = await noticeClocks(
    tx,
    and(
      eq(clocks.status, 'running'),
      gte(clocks.currentDue, today),
      lte(clocks.currentDue, addDays(today, WARNING_DAYS)),
    ),
  )
  await queueClockNotices(tx, { event: 'clock_due_soon', clocks: soon.filter(isActionDue) }, signal)
}

export async function noticeOverdueClocks(
  tx: Tx,
  clockIds: readonly string[],
  signal: AbortSignal,
): Promise<void> {
  if (clockIds.length === 0) return
  const overdue = await noticeClocks(
    tx,
    and(inArray(clocks.id, [...clockIds]), eq(clocks.status, 'overdue')),
  )
  await queueClockNotices(tx, { event: 'clock_overdue', clocks: overdue }, signal)
}
