import { and, eq, lt } from 'drizzle-orm'
import { JOB_NAMES } from '@/constants/jobNames'
import type { Tx } from '@/db/client'
import { applications, clocks } from '@/db/schema'
import { transitionApplication } from '@/features/applications/transition'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { townToday } from '@/features/town/today'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'
import { ok } from '@/types/result'
import { defineJob, failKeepingWrites } from './defineJob'

const SECONDS_PER_DAY = 86_400
const SYSTEM_ACTOR = { kind: 'system', job: JOB_NAMES.CLOCKS_DAILY } as const

interface DailyPayload {
  today?: CivilDate
}

async function markOverdue(tx: Tx, today: CivilDate): Promise<void> {
  const pack = loadPack()
  const past = await tx
    .select()
    .from(clocks)
    .where(and(eq(clocks.status, 'running'), lt(clocks.currentDue, today)))
  for (const clock of past) {
    const rule = ruleByKey(pack, clock.ruleKey, clock.ruleVersion)
    if (rule.kind === 'clock' && rule.clockType === 'action_due') {
      await tx.update(clocks).set({ status: 'overdue' }).where(eq(clocks.id, clock.id))
    }
  }
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
    if (rule.kind !== 'clock' || rule.clockType !== 'exercise_by' || state !== 'issued') continue
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
  dedupKey: (p) => `clocks.daily:${p.today ?? todayInTimeZone('UTC', new Date())}`,
  handler: async (payload, ctx) => {
    const today = payload.today ?? (await townToday(ctx.db, new Date(), ctx.signal))
    await markOverdue(ctx.db, today)
    const failures = await expireLapsedPermits(ctx.db, today, ctx.signal)
    if (failures.length > 0) return failKeepingWrites(`expiry failed: ${failures.join('; ')}`)
    return ok(undefined)
  },
})
