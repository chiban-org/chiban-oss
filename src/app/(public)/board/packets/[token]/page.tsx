import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PacketItems } from '@/components/board/PacketItems'
import { db } from '@/db/client'
import { openPacket } from '@/features/boards/packetLinks'
import { formatCivilDate } from '@/lib/formatDate'

export const metadata: Metadata = { title: 'Board packet' }

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000

export default async function BoardPacketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const opened = await openPacket(db, token, new Date(), AbortSignal.timeout(TIMEOUT_MS))
  if (!opened.ok && opened.error === 'invalid') notFound()
  if (!opened.ok) {
    return (
      <main>
        <meta name="robots" content="noindex" />
        <h1>This link has expired</h1>
        <p>This link has expired. Ask the land use office for a new one.</p>
      </main>
    )
  }
  const packet = opened.value
  const base = `/board/packets/${token}/documents`
  return (
    <main className="space-y-4">
      <meta name="robots" content="noindex" />
      <h1>{packet.title}</h1>
      <p>{`${packet.boardShortName}, meeting ${formatCivilDate(packet.meetingDate)}`}</p>
      <PacketItems items={packet.items} base={base} />
    </main>
  )
}
