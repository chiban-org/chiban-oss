import type { Board } from '@packs/nh/schema'
import type { DbOrTx } from '@/db/client'
import type { ApplicationContext } from '@/features/applications/context'
import { voteClockKey } from '@/features/applications/meetingDeadline'
import { filedInTime, filingLeadFor } from '@/features/boards/filingLead'
import { factsWithDeterminations } from '@/features/clocks/derivedFacts'
import { effectiveNoticeLeadDays } from '@/features/clocks/noticeLead'
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

export async function meetingEligibility(
  db: DbOrTx,
  app: ApplicationContext,
  board: Board,
  today: CivilDate,
  signal: AbortSignal,
): Promise<(meetingDate: string) => MeetingEligibility> {
  if (app.state !== 'submitted') return () => ANY_MEETING
  const [lead, noticeLead] = await Promise.all([
    filingLeadFor(db, app, board, signal),
    noticeLeadFor(db, app, board, signal),
  ])
  const earliest = noticeLead === undefined ? null : addDays(today, noticeLead)
  return (meetingDate) => ({
    filedInTime: filedInTime(lead, app.receivedDate, meetingDate as CivilDate),
    noticeable: earliest === null || compareCivil(meetingDate as CivilDate, earliest) >= 0,
  })
}
