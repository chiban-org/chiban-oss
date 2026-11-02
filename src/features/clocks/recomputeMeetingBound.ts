import type { Board, ClockRule } from '@packs/nh/schema'
import { eq, inArray } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { clocks } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { boardMeetingCalendar } from '@/features/boards/calendar'
import { factsWithDeterminations } from '@/features/clocks/derivedFacts'
import { meetingBoundSpec } from '@/features/clocks/meetingBound'
import { meetingBoundTiming } from '@/features/clocks/meetingBoundTiming'
import { createClock } from '@/features/clocks/startClocks'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

export const MEETING_CALENDAR_CHANGED = 'meeting_calendar_changed'

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
      },
      signal,
    )
    if (timing === null || timing.due === clock.currentDue) continue
    const app = await loadApplicationContext(tx, clock.applicationId, signal)
    if (app === null) continue
    const freshId = await createClock(
      tx,
      {
        applicationId: clock.applicationId,
        rule: rule as ClockRule,
        facts: await factsWithDeterminations(tx, clock.applicationId, app.facts),
        event: clock.startEvent as ClockRule['startEvent'],
        onDate: clock.startDate as CivilDate,
        pack,
        calendar,
      },
      signal,
    )
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
