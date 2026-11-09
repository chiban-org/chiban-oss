import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { OfficeContactLine } from '@/components/board/OfficeContactLine'
import { PacketContents } from '@/components/board/PacketItems'
import { db } from '@/db/client'
import { packetWhen } from '@/features/boards/meetingWhen'
import { officeContact } from '@/features/boards/officeContact'
import { refusalCopy } from '@/features/boards/packetLinkCopy'
import { openPacket } from '@/features/boards/packetLinks'
import { formatCivilDate } from '@/lib/formatDate'

export const metadata: Metadata = { title: 'Board packet' }

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000

export default async function BoardPacketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const opened = await openPacket(db, token, new Date(), signal)
  if (!opened.ok) {
    if (opened.error === 'invalid') notFound()
    const copy = refusalCopy(opened.error)
    return (
      <main>
        <meta name="robots" content="noindex" />
        <h1>{copy.heading}</h1>
        <p>{copy.body}</p>
        <OfficeContactLine contact={await officeContact(db, signal)} />
      </main>
    )
  }
  const packet = opened.value
  return (
    <main className="space-y-4">
      <meta name="robots" content="noindex" />
      <h1>{`${packet.boardShortName} packet`}</h1>
      <p>{packetWhen(packet)}</p>
      {packet.expiresOn === null ? null : (
        <p>{`This link works until ${formatCivilDate(packet.expiresOn)}.`}</p>
      )}
      <PacketContents view={packet} base={`/board/packets/${token}/documents`} />
    </main>
  )
}
