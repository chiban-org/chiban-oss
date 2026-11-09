import type { DbOrTx } from '@/db/client'
import { loadPastMeetings, loadUpcomingMeetings } from '@/features/hearings/publicMeetings'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const FAR_FUTURE = '2999-01-01' as CivilDate
const FAR_PAST = '1900-01-01' as CivilDate

export async function publicMinutes(db: DbOrTx) {
  const { meetings } = await loadPastMeetings(db, { today: FAR_FUTURE, page: 1 }, signal)
  return meetings.flatMap((m) =>
    m.minutes === null
      ? []
      : [{ meetingId: m.meetingId, documentId: m.minutes.documentId, meeting: m }],
  )
}

export async function publicMinutesText(db: DbOrTx): Promise<string[]> {
  return (await publicMinutes(db)).map(
    ({ meeting }) =>
      `${meeting.boardShortName}, ${formatCivilDate(meeting.meetingDate)}, approved ${formatCivilDate(meeting.minutes?.approvedOn ?? meeting.meetingDate)}`,
  )
}

export async function publicAgendaText(db: DbOrTx): Promise<string[]> {
  return (await loadUpcomingMeetings(db, FAR_PAST, signal))
    .filter((m) => m.agendaDocumentId !== null)
    .map((m) => `${m.boardShortName}, ${formatCivilDate(m.meetingDate)}`)
}
