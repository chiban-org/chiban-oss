import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PacketItems } from '@/components/board/PacketItems'
import { isBoardMember } from '@/features/access/predicates'
import { getMemberPacket } from '@/features/boards/memberPackets'
import { formatCivilDate } from '@/lib/formatDate'
import { requirePortalContext } from '@/server/requirePortal'

export const metadata: Metadata = { title: 'Board meeting' }

export const dynamic = 'force-dynamic'

const LINK = 'tap-target inline-flex items-center'
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
      <p>{`${packet.value.boardShortName}, meeting ${formatCivilDate(packet.value.meetingDate)}`}</p>
      <PacketItems items={packet.value.items} base={base} />
    </main>
  )
}
