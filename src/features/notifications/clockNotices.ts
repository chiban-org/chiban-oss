import { and, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
  applications,
  clocks,
  notificationOutbox,
  roleCapabilities,
  userRoles,
  users,
} from '@/db/schema'
import { TERMINAL_STATES } from '@/features/applications/states'
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

async function staffFor(tx: Tx, applicationId: string): Promise<string[]> {
  const [app] = await tx
    .select({ responsibleUserId: applications.responsibleUserId })
    .from(applications)
    .where(eq(applications.id, applicationId))
  const responsible = app?.responsibleUserId ?? null
  return responsible === null ? await applicationManagers(tx) : [responsible]
}

export async function queueClockNotice(
  tx: Tx,
  input: { event: ClockNoticeEvent; clock: NoticeClock },
  signal: AbortSignal,
): Promise<boolean> {
  const { event, clock } = input
  if (await alreadyQueued(tx, event, clock)) return false
  await queueNotification(
    tx,
    {
      event,
      applicationId: clock.applicationId,
      recipientUserIds: await staffFor(tx, clock.applicationId),
      discriminator: discriminatorOf(clock),
      extra: { clockLabel: clockLabel(clock), dueOn: clock.currentDue },
    },
    signal,
  )
  return true
}

const OPEN_APPLICATION = notInArray(applications.state, [...TERMINAL_STATES])

export async function warnClocksDueSoon(
  tx: Tx,
  today: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  const soon = await tx
    .select({
      id: clocks.id,
      applicationId: clocks.applicationId,
      ruleKey: clocks.ruleKey,
      ruleVersion: clocks.ruleVersion,
      currentDue: clocks.currentDue,
    })
    .from(clocks)
    .innerJoin(applications, eq(applications.id, clocks.applicationId))
    .where(
      and(
        eq(clocks.status, 'running'),
        gte(clocks.currentDue, today),
        lte(clocks.currentDue, addDays(today, WARNING_DAYS)),
        OPEN_APPLICATION,
      ),
    )
  for (const clock of soon.filter(isActionDue)) {
    await queueClockNotice(tx, { event: 'clock_due_soon', clock }, signal)
  }
}

export async function noticeOverdueClocks(
  tx: Tx,
  clockIds: readonly string[],
  signal: AbortSignal,
): Promise<void> {
  if (clockIds.length === 0) return
  const overdue = await tx
    .select({
      id: clocks.id,
      applicationId: clocks.applicationId,
      ruleKey: clocks.ruleKey,
      ruleVersion: clocks.ruleVersion,
      currentDue: clocks.currentDue,
    })
    .from(clocks)
    .innerJoin(applications, eq(applications.id, clocks.applicationId))
    .where(and(inArray(clocks.id, [...clockIds]), eq(clocks.status, 'overdue'), OPEN_APPLICATION))
  for (const clock of overdue) {
    await queueClockNotice(tx, { event: 'clock_overdue', clock }, signal)
  }
}
