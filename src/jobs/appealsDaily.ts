import { and, eq, inArray, lt } from 'drizzle-orm'
import { JOB_NAMES } from '@/constants/jobNames'
import type { Tx } from '@/db/client'
import { applications, clocks, recordEvents } from '@/db/schema'
import { finality } from '@/features/appeals/finality'
import { recordFinalApproval } from '@/features/boards/exercise'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { ok } from '@/types/result'
import { defineJob } from './defineJob'

const SECONDS_PER_DAY = 86_400
const SYSTEM_ACTOR = { kind: 'system', job: JOB_NAMES.APPEALS_DAILY } as const

interface DailyPayload {
  today?: CivilDate
}

async function lapseEndedWindows(tx: Tx, today: CivilDate): Promise<string[]> {
  const pack = loadPack()
  const past = await tx
    .select()
    .from(clocks)
    .where(and(inArray(clocks.status, ['running', 'overdue']), lt(clocks.currentDue, today)))
  const touched = new Set<string>()
  for (const clock of past) {
    const rule = ruleByKey(pack, clock.ruleKey, clock.ruleVersion)
    if (rule.kind !== 'clock' || rule.clockType !== 'filing_window') continue
    await tx.update(clocks).set({ status: 'lapsed' }).where(eq(clocks.id, clock.id))
    touched.add(clock.applicationId)
  }
  return [...touched]
}

async function recordExpiry(tx: Tx, applicationId: string, today: CivilDate): Promise<boolean> {
  const [app] = await tx.select().from(applications).where(eq(applications.id, applicationId))
  if (app === undefined) return false
  const [existing] = await tx
    .select({ id: recordEvents.id })
    .from(recordEvents)
    .where(
      and(
        eq(recordEvents.applicationId, applicationId),
        eq(recordEvents.kind, 'appeal_period_expired'),
      ),
    )
  if (existing !== undefined) return false
  await tx.insert(recordEvents).values({
    projectId: app.projectId,
    applicationId,
    kind: 'appeal_period_expired',
    occurredOn: today,
    recordedByKind: 'system',
  })
  return true
}

export async function closeAppealPeriods(
  tx: Tx,
  today: CivilDate,
  signal: AbortSignal,
): Promise<{ closed: string[] }> {
  const closed: string[] = []
  for (const applicationId of await lapseEndedWindows(tx, today)) {
    const result = await finality(tx, applicationId, today, signal)
    if (!result.final) continue
    if (await recordExpiry(tx, applicationId, today)) closed.push(applicationId)
    if (result.finalOn !== null) {
      await recordFinalApproval(
        tx,
        SYSTEM_ACTOR,
        { applicationId, finalOn: result.finalOn },
        signal,
      )
    }
  }
  return { closed }
}

export const appealsDailyJob = defineJob<DailyPayload>({
  name: JOB_NAMES.APPEALS_DAILY,
  intervalSeconds: SECONDS_PER_DAY,
  dedupKey: (p) => `appeals.daily:${p.today ?? 'scheduled'}`,
  handler: async (payload, ctx) => {
    const today = payload.today ?? (await townToday(ctx.db, new Date(), ctx.signal))
    await closeAppealPeriods(ctx.db, today, ctx.signal)
    return ok(undefined)
  },
})
