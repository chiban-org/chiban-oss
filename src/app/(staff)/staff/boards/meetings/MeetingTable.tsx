import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { StatusChip } from '@/components/StatusChip'
import { TextField } from '@/components/staff/fields'
import type { MeetingListRow } from '@/features/boards/meetingList'
import {
  AGENDA_STATE_LABELS,
  MEETING_KIND_LABELS,
  type MeetingSortKey,
} from '@/features/boards/meetingListParams'
import type { SortLink } from '@/features/dataTable/sort'
import { formatCivilDate } from '@/lib/formatDate'
import { cancelMeetingAction } from '../actions'

function CancelMeeting({ meetingId }: { meetingId: string }) {
  return (
    <details>
      <summary>Cancel</summary>
      <ActionForm action={cancelMeetingAction} submitLabel="Cancel meeting">
        <input type="hidden" name="meetingId" value={meetingId} />
        <TextField label="Reason" name="reason" required />
      </ActionForm>
    </details>
  )
}

export function MeetingTable({
  rows,
  links,
  boardNames,
  usualLocation,
  upcoming,
}: {
  rows: MeetingListRow[]
  links: Record<MeetingSortKey, SortLink>
  boardNames: ReadonlyMap<string, string>
  usualLocation: string
  upcoming: boolean
}) {
  const showLocation = rows.some((r) => r.location !== usualLocation)
  return (
    <table className="w-full min-w-[40rem] text-sm">
      <caption className="sr-only">Board meetings</caption>
      <thead>
        <tr>
          <SortHeader label="Date" link={links.date} />
          <SortHeader label="Board" link={links.board} />
          <SortHeader label="Kind" link={links.kind} />
          {showLocation ? <SortHeader label="Location" link={links.location} /> : null}
          <SortHeader label="Hearings" link={links.hearings} />
          <SortHeader label="Agenda" link={links.agenda} />
          {upcoming ? (
            <th scope="col">
              <span className="sr-only">Cancel</span>
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="align-top">
            <td className="whitespace-nowrap">
              <Link href={`/staff/boards/meetings/${r.id}`} className="font-semibold">
                {formatCivilDate(r.meetingDate)}
              </Link>
              {r.cancelled ? (
                <span className="mt-1 block">
                  <StatusChip status="neutral" label="Cancelled" />
                </span>
              ) : null}
            </td>
            <td>{boardNames.get(r.board) ?? r.board}</td>
            <td>{MEETING_KIND_LABELS.get(r.kind)}</td>
            {showLocation ? <td>{r.location === usualLocation ? '' : r.location}</td> : null}
            <td className="tabular-nums">{r.hearings === 0 ? 'None' : r.hearings}</td>
            <td>{AGENDA_STATE_LABELS.get(r.agenda)}</td>
            {upcoming ? <td>{r.cancelled ? null : <CancelMeeting meetingId={r.id} />}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
