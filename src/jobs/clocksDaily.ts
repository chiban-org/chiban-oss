import { and, eq, inArray, isNull, lt } from 'drizzle-orm'
import { JOB_NAMES } from '@/constants/jobNames'
import type { Tx } from '@/db/client'
import { applications, clocks, relianceLinks } from '@/db/schema'
import { transitionApplication } from '@/features/applications/transition'
import {
  isActionDue,
  noticeOverdueClocks,
  warnClocksDueSoon,
} from '@/features/notifications/clockNotices'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { townToday } from '@/features/town/today'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'
import { ok } from '@/types/result'
import { defineJob, failKeepingWrites } from './defineJob'

const SECONDS_PER_DAY = 86_400
const EXPIRABLE = ['issued', 'decided']
const SYSTEM_ACTOR = { kind: 'system', job: JOB_NAMES.CLOCKS_DAILY } as const

interface DailyPayload {
  today?: CivilDate
}

async function markOverdue(tx: Tx, today: CivilDate): Promise<string[]> {
  const past = await tx
    .select()
    .from(clocks)
    .where(and(eq(clocks.status, 'running'), lt(clocks.currentDue, today)))
  const flipped = past.filter(isActionDue).map((clock) => clock.id)
  if (flipped.length > 0) {
    await tx.update(clocks).set({ status: 'overdue' }).where(inArray(clocks.id, flipped))
  }
  return flipped
}

async function stillLapsed(
  tx: Tx,
  clockId: string,
  applicationId: string,
  today: CivilDate,
): Promise<boolean> {
  await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .for('update')
  const [live] = await tx.select().from(clocks).where(eq(clocks.id, clockId)).for('update')
  const [app] = await tx.select().from(applications).where(eq(applications.id, applicationId))
  return (
    live?.status === 'running' &&
    live.currentDue < today &&
    app !== undefined &&
    EXPIRABLE.includes(app.state)
  )
}

async function hasUnresolvedReliance(tx: Tx, applicationId: string): Promise<boolean> {
  const [open] = await tx
    .select({ id: relianceLinks.planningApplicationId })
    .from(relianceLinks)
    .where(
      and(eq(relianceLinks.varianceApplicationId, applicationId), isNull(relianceLinks.resolvedOn)),
    )
    .limit(1)
  return open !== undefined
}

export async function expireLapsedPermits(
  tx: Tx,
  today: CivilDate,
  signal: AbortSignal,
  move: typeof transitionApplication = transitionApplication,
): Promise<string[]> {
  const pack = loadPack()
  const past = await tx
    .select({ clock: clocks, state: applications.state, rowVersion: applications.rowVersion })
    .from(clocks)
    .innerJoin(applications, eq(applications.id, clocks.applicationId))
    .where(and(eq(clocks.status, 'running'), lt(clocks.currentDue, today)))
  const failures: string[] = []
  for (const { clock, state, rowVersion } of past) {
    const rule = ruleByKey(pack, clock.ruleKey, clock.ruleVersion)
    if (rule.kind !== 'clock' || rule.clockType !== 'exercise_by' || !EXPIRABLE.includes(state))
      continue
    if (await hasUnresolvedReliance(tx, clock.applicationId)) continue
    if (!(await stillLapsed(tx, clock.id, clock.applicationId, today))) continue
    await tx.update(clocks).set({ status: 'lapsed' }).where(eq(clocks.id, clock.id))
    const moved = await move(
      tx,
      SYSTEM_ACTOR,
      {
        applicationId: clock.applicationId,
        to: 'expired',
        expectedRowVersion: rowVersion,
        onDate: today,
      },
      signal,
    )
    if (!moved.ok) {
      await tx.update(clocks).set({ status: 'running' }).where(eq(clocks.id, clock.id))
      failures.push(`${clock.applicationId}: ${JSON.stringify(moved.error)}`)
    }
  }
  return failures
}

export const clocksDailyJob = defineJob<DailyPayload>({
  name: JOB_NAMES.CLOCKS_DAILY,
  intervalSeconds: SECONDS_PER_DAY,
  dedupKey: (p) =>
    p.today === undefined
      ? `clocks.daily.scheduled:${todayInTimeZone('UTC', new Date())}`
      : `clocks.daily:${p.today}`,
  handler: async (payload, ctx) => {
    const today = payload.today ?? (await townToday(ctx.db, new Date(), ctx.signal))
    await noticeOverdueClocks(ctx.db, await markOverdue(ctx.db, today), ctx.signal)
    await warnClocksDueSoon(ctx.db, today, ctx.signal)
    const failures = await expireLapsedPermits(ctx.db, today, ctx.signal)
    if (failures.length > 0) return failKeepingWrites(`expiry failed: ${failures.join('; ')}`)
    return ok(undefined)
  },
})
