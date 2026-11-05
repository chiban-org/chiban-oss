import Link from 'next/link'
import { Marker } from '@/components/board/PacketItems'
import { isBoardMember } from '@/features/access/predicates'
import { listMemberMeetings, type MemberMeetingRow } from '@/features/boards/memberPackets'
import { formatCivilDate } from '@/lib/formatDate'
import { requirePortalContext } from '@/server/requirePortal'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const BOARD_NAMES = { planning_board: 'Planning Board', zba: 'Zoning Board of Adjustment' } as const
const LINK = 'tap-target inline-flex items-center'

function RowMarker({ row }: { row: MemberMeetingRow }) {
  if (row.cancelled) return <Marker text="Cancelled" />
  if (row.marker === null) return null
  return (
    <Marker
      text={row.marker.kind === 'new' ? 'New' : `Updated ${formatCivilDate(row.marker.on)}`}
    />
  )
}

function RowAction({ row }: { row: MemberMeetingRow }) {
  if (row.cancelled) return <p className="m-0">The meeting is cancelled. Its packet is closed.</p>
  return row.hasPacket ? (
    <Link href={`/board/meetings/${row.meetingId}`} className={LINK}>
      Open the packet
    </Link>
  ) : (
    <p className="m-0">The packet is not ready yet.</p>
  )
}

export default async function BoardHomePage() {
  const ctx = await requirePortalContext('/board')
  if (!isBoardMember(ctx.actor)) {
    return (
      <main className="space-y-4">
        <h1>Board meetings</h1>
        <p role="alert">You do not have permission to read board packets.</p>
      </main>
    )
  }
  const page = await listMemberMeetings(ctx.db, ctx.actor, { limit: PAGE_SIZE }, ctx.signal)
  return (
    <main className="space-y-6">
      <h1>Board meetings</h1>
      {page.rows.length === 0 ? (
        <p>No meeting packets are ready for you yet. You will get an email when one is.</p>
      ) : (
        <ul className="m-0 list-none divide-y p-0">
          {page.rows.map((row) => (
            <li key={row.meetingId} className="py-3">
              <p className="m-0 font-semibold">
                {`${BOARD_NAMES[row.board]}, ${formatCivilDate(row.meetingDate)}`}
                <RowMarker row={row} />
              </p>
              <RowAction row={row} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
