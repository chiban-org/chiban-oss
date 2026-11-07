import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { hearings } from '@/db/schema'
import type { ApplicationContext } from '@/features/applications/context'
import { isTerminalState } from '@/features/applications/states'
import { filedInTime, filingLeadFor } from '@/features/boards/filingLead'
import { earliestNoticeDue } from '@/features/notices/noticeDue'
import { type NoticeStatus, noticeStatus } from '@/features/notices/noticeStatus'
import { type CivilDate, compareCivil } from '@/types/civilDate'

export interface MeetingEligibility {
  filedInTime: boolean
  noticeable: boolean
}

const ANY_MEETING: MeetingEligibility = { filedInTime: true, noticeable: true }

function stillSendable(status: NoticeStatus, today: CivilDate): boolean {
  return (
    status.items.length > 0 &&
    status.items.every((item) =>
      item.proof === null ? compareCivil(today, item.dueOn) <= 0 : item.state === 'proved_on_time',
    )
  )
}

async function noticedMeetings(
  db: DbOrTx,
  applicationId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<Set<string>> {
  const rows = await db
    .select({ meetingId: hearings.meetingId, setId: hearings.noticeSetId })
    .from(hearings)
    .where(and(eq(hearings.applicationId, applicationId), eq(hearings.status, 'scheduled')))
  const usable = await Promise.all(
    rows.map(async (r) =>
      stillSendable(await noticeStatus(db, r.setId, signal), today) ? r.meetingId : null,
    ),
  )
  return new Set(usable.filter((id) => id !== null))
}

export async function meetingEligibility(
  db: DbOrTx,
  app: ApplicationContext,
  boardId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<(meeting: { id: string; meetingDate: string }) => MeetingEligibility> {
  if (isTerminalState(app.state)) return () => ANY_MEETING
  const [lead, noticeDue, noticed] = await Promise.all([
    app.state === 'submitted' ? filingLeadFor(db, app, boardId, signal) : null,
    earliestNoticeDue(db, app, signal),
    noticedMeetings(db, app.id, today, signal),
  ])
  return ({ id, meetingDate }) => {
    const due = noticeDue(meetingDate as CivilDate)
    return {
      filedInTime: filedInTime(lead, app.receivedDate, meetingDate as CivilDate),
      noticeable: due === null || noticed.has(id) || compareCivil(today, due) <= 0,
    }
  }
}
