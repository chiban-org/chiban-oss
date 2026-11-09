import Link from 'next/link'
import { LINK, NewTabLink } from '@/components/board/NewTabLink'
import { Marker } from '@/components/board/PacketItems'
import { meetingWhenAndWhere } from '@/features/boards/meetingWhen'
import type { MeetingRecordLink } from '@/features/boards/memberMeetingRecords'
import type { MemberMeetingSplit } from '@/features/boards/memberMeetingSplit'
import { markerText } from '@/features/boards/memberMeetingSplit'
import type { MemberMeetingRow } from '@/features/boards/memberPackets'

type Records = ReadonlyMap<string, MeetingRecordLink[]>

function RowActions({ row, records }: { row: MemberMeetingRow; records: MeetingRecordLink[] }) {
  if (row.cancelled) return <p className="m-0">The meeting is cancelled. Its packet is closed.</p>
  const links = [
    row.hasPacket ? (
      <Link key="packet" href={`/board/meetings/${row.meetingId}`} className={LINK}>
        Open the packet
      </Link>
    ) : null,
    !row.hasPacket && row.agendaDocumentId !== null ? (
      <NewTabLink key="agenda" href={`/api/documents/${row.agendaDocumentId}`}>
        Read the agenda
      </NewTabLink>
    ) : null,
    ...records.map((record) => (
      <NewTabLink key={record.key} href={`/api/documents/${record.documentId}`}>
        {record.label}
      </NewTabLink>
    )),
  ].filter((link) => link !== null)
  if (links.length === 0) return <p className="m-0">The agenda is not published yet.</p>
  return (
    <ul className="m-0 flex list-none flex-col items-start gap-1 p-0">
      {links.map((link) => (
        <li key={link.key}>{link}</li>
      ))}
    </ul>
  )
}

function Meeting({ row, records }: { row: MemberMeetingRow; records: MeetingRecordLink[] }) {
  const marker = markerText(row)
  return (
    <>
      <p className="m-0 font-semibold">
        {row.boardShortName}
        {marker === null ? null : <Marker text={marker} />}
      </p>
      <p className="mt-1 mb-2">{meetingWhenAndWhere(row)}</p>
      <RowActions row={row} records={records} />
    </>
  )
}

function MeetingList({
  title,
  rows,
  records,
}: {
  title: string
  rows: MemberMeetingRow[]
  records: Records
}) {
  if (rows.length === 0) return null
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      <ul className="list-none space-y-3 p-0">
        {rows.map((row) => (
          <li key={row.meetingId} className="record-item">
            <Meeting row={row} records={records.get(row.meetingId) ?? []} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function MemberMeetings({
  split,
  records,
}: {
  split: MemberMeetingSplit | null
  records: Records
}) {
  if (split === null) {
    return (
      <section aria-label="Meetings">
        <h2>Meetings</h2>
        <p>No meeting packets are ready for you yet. You will get an email when one is.</p>
      </section>
    )
  }
  return (
    <>
      <section aria-label="Next meeting">
        <h2>Next meeting</h2>
        {split.next === null ? (
          <p>No meeting of your board is coming up.</p>
        ) : (
          <Meeting row={split.next} records={records.get(split.next.meetingId) ?? []} />
        )}
      </section>
      <MeetingList title="Later meetings" rows={split.later} records={records} />
      <MeetingList title="Earlier meetings" rows={split.earlier} records={records} />
    </>
  )
}
