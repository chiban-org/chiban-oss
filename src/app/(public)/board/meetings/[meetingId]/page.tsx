import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isBoardMember } from '@/features/access/predicates'
import { getMemberPacket } from '@/features/boards/memberPackets'
import { formatCivilDate } from '@/lib/formatDate'
import { requirePortalContext } from '@/server/requirePortal'

export const dynamic = 'force-dynamic'

const BOARD_NAMES = { planning_board: 'Planning Board', zba: 'Zoning Board of Adjustment' } as const
const LINK = 'tap-target inline-flex items-center underline'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function BoardMeetingPage({
  params,
}: {
  params: Promise<{ meetingId: string }>
}) {
  const { meetingId } = await params
  const ctx = await requirePortalContext(`/board/meetings/${meetingId}`)
  if (!UUID.test(meetingId) || !isBoardMember(ctx.actor)) notFound()
  const packet = await getMemberPacket(ctx.db, ctx.actor, meetingId, ctx.signal)
  if (!packet.ok) notFound()
  const base = `/board/meetings/${meetingId}/documents`
  return (
    <main className="space-y-4">
      <meta name="robots" content="noindex" />
      <p>
        <Link href="/board" className={LINK}>
          All meetings
        </Link>
      </p>
      <h1>{packet.value.title}</h1>
      <p>{`${BOARD_NAMES[packet.value.board]}, meeting ${formatCivilDate(packet.value.meetingDate)}`}</p>
      <ul className="m-0 list-none space-y-2 p-0">
        {packet.value.items.map((item) => (
          <li key={item.versionId}>
            {item.withdrawnOn === null ? (
              <Link href={`${base}/${item.versionId}`} className={LINK}>
                {item.title}
              </Link>
            ) : (
              <span>{`${item.title}: withdrawn by the town on ${formatCivilDate(item.withdrawnOn)}`}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
