import type { Board, ClockRule } from '@packs/nh/schema'
import { asc, eq, inArray } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { clockAdjustments, clocks } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { boardMeetingCalendar } from '@/features/boards/calendar'
import { factsWithDeterminations } from '@/features/clocks/derivedFacts'
import { meetingBoundSpec } from '@/features/clocks/meetingBound'
import { meetingBoundTiming } from '@/features/clocks/meetingBoundTiming'
import { effectiveNoticeLeadDays } from '@/features/clocks/noticeLead'
import { createClock } from '@/features/clocks/startClocks'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

export const MEETING_CALENDAR_CHANGED = 'meeting_calendar_changed'

async function carryAdjustments(tx: Tx, fromClockId: string, toClockId: string): Promise<void> {
  const recorded = await tx
    .select()
    .from(clockAdjustments)
    .where(eq(clockAdjustments.clockId, fromClockId))
    .orderBy(asc(clockAdjustments.createdAt))
  if (recorded.length === 0) return
  await tx.insert(clockAdjustments).values(
    recorded.map(({ id: _id, clockId: _clockId, ...rest }) => ({
      ...rest,
      clockId: toClockId,
    })),
  )
  const governing = recorded.flatMap((a) => (a.newDue === null ? [] : [a.newDue])).at(-1)
  if (governing !== undefined) {
    await tx.update(clocks).set({ currentDue: governing }).where(eq(clocks.id, toClockId))
  }
}

export async function recomputeMeetingBoundClocks(
  tx: Tx,
  board: Board,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  const pack = loadPack()
  const live = await tx
    .select()
    .from(clocks)
    .where(inArray(clocks.status, ['running', 'overdue']))
  const calendar = boardMeetingCalendar(tx)
  for (const clock of live) {
    const rule = ruleByKey(pack, clock.ruleKey, clock.ruleVersion)
    if (rule.kind !== 'clock') continue
    const spec = meetingBoundSpec(rule, pack)
    if (spec === null || spec.board !== board) continue
    const app = await loadApplicationContext(tx, clock.applicationId, signal)
    if (app === null) continue
    const facts = await factsWithDeterminations(tx, clock.applicationId, app.facts)
    const timing = await meetingBoundTiming(
      {
        rule,
        length: {
          unit: clock.lengthUnit,
          value: clock.lengthValue,
          source: clock.source,
          packDefault: clock.lengthValue,
        },
        onDate: clock.startDate as CivilDate,
        pack,
        calendar,
        noticeLeadDays: await effectiveNoticeLeadDays(tx, rule, facts, pack, signal),
      },
      signal,
    )
    if (timing === null || timing.due === clock.computedDue) continue
    const freshId = await createClock(
      tx,
      {
        applicationId: clock.applicationId,
        rule,
        facts,
        event: clock.startEvent as ClockRule['startEvent'],
        onDate: clock.startDate as CivilDate,
        pack,
        calendar,
      },
      signal,
    )
    await carryAdjustments(tx, clock.id, freshId)
    await tx
      .update(clocks)
      .set({
        status: 'superseded',
        supersededBy: freshId,
        supersededReason: MEETING_CALENDAR_CHANGED,
      })
      .where(eq(clocks.id, clock.id))
  }
}
