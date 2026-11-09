import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BoardRefusal } from '@/components/board/BoardRefusal'
import { LINK } from '@/components/board/NewTabLink'
import { PacketContents } from '@/components/board/PacketItems'
import { isBoardMember } from '@/features/access/predicates'
import { packetWhen } from '@/features/boards/meetingWhen'
import { BOARD_HOME_TITLE } from '@/features/boards/memberCopy'
import { getMemberPacket } from '@/features/boards/memberPackets'
import { requirePortalContext } from '@/server/requirePortal'
import { isUuid } from '@/utils/uuid'

export const metadata: Metadata = { title: 'Board meeting packet' }

export const dynamic = 'force-dynamic'

export default async function BoardMeetingPage({
  params,
}: {
  params: Promise<{ meetingId: string }>
}) {
  const { meetingId } = await params
  const ctx = await requirePortalContext(`/board/meetings/${meetingId}`)
  if (!isBoardMember(ctx.actor)) return <BoardRefusal />
  if (!isUuid(meetingId)) notFound()
  const packet = await getMemberPacket(ctx.db, ctx.actor, meetingId, ctx.signal)
  if (!packet.ok) notFound()
  const view = packet.value
  return (
    <main className="space-y-4">
      <meta name="robots" content="noindex" />
      <p>
        <Link href="/board" className={LINK}>
          {BOARD_HOME_TITLE}
        </Link>
      </p>
      <h1>{`${view.boardShortName} packet`}</h1>
      <p>{packetWhen(view)}</p>
      <PacketContents view={view} base={`/board/meetings/${meetingId}/documents`} />
    </main>
  )
}
