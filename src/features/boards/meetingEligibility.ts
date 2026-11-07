import type { Board } from '@packs/nh/schema'
import { and, eq, isNotNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { hearings } from '@/db/schema'
import type { ApplicationContext } from '@/features/applications/context'
import { voteClockKey } from '@/features/applications/meetingDeadline'
import { filedInTime, filingLeadFor } from '@/features/boards/filingLead'
import { factsWithDeterminations } from '@/features/clocks/derivedFacts'
import { effectiveNoticeLeadDays } from '@/features/clocks/noticeLead'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { addDays, type CivilDate, compareCivil } from '@/types/civilDate'

export interface MeetingEligibility {
  filedInTime: boolean
  noticeable: boolean
}

const ANY_MEETING: MeetingEligibility = { filedInTime: true, noticeable: true }

async function noticeLeadFor(
  db: DbOrTx,
  app: ApplicationContext,
  board: Board,
  signal: AbortSignal,
) {
  const pack = loadPack()
  const rule = ruleByKey(pack, voteClockKey(board))
  if (rule.kind !== 'clock') return undefined
  const facts = await factsWithDeterminations(db, app.id, app.facts)
  return await effectiveNoticeLeadDays(db, rule, facts, pack, signal)
}

async function noticedMeetings(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<Set<string>> {
  const rows = await db
    .select({ meetingId: hearings.meetingId, setId: hearings.noticeSetId })
    .from(hearings)
    .where(
      and(
        eq(hearings.applicationId, applicationId),
        eq(hearings.status, 'scheduled'),
        isNotNull(hearings.properlyNoticedAt),
      ),
    )
  const proved = await Promise.all(
    rows.map(async (r) =>
      (await noticeStatus(db, r.setId, signal)).properlyNoticed ? r.meetingId : null,
    ),
  )
  return new Set(proved.filter((id) => id !== null))
}

export async function meetingEligibility(
  db: DbOrTx,
  app: ApplicationContext,
  board: Board,
  today: CivilDate,
  signal: AbortSignal,
): Promise<(meeting: { id: string; meetingDate: string }) => MeetingEligibility> {
  if (app.state !== 'submitted') return () => ANY_MEETING
  const [lead, noticeLead, noticed] = await Promise.all([
    filingLeadFor(db, app, board, signal),
    noticeLeadFor(db, app, board, signal),
    noticedMeetings(db, app.id, signal),
  ])
  const earliest = noticeLead === undefined ? null : addDays(today, noticeLead)
  return ({ id, meetingDate }) => ({
    filedInTime: filedInTime(lead, app.receivedDate, meetingDate as CivilDate),
    noticeable:
      earliest === null || noticed.has(id) || compareCivil(meetingDate as CivilDate, earliest) >= 0,
  })
}
