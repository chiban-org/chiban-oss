import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { openPacket } from '@/features/boards/packetLinks'
import { formatCivilDate } from '@/lib/formatDate'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 10_000
const BOARD_NAMES = { planning_board: 'Planning Board', zba: 'Zoning Board of Adjustment' } as const
const LINK = 'tap-target inline-flex items-center underline'

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
      <p>{`${BOARD_NAMES[packet.board]}, meeting ${formatCivilDate(packet.meetingDate)}`}</p>
      <ul className="m-0 list-none space-y-2 p-0">
        <li>
          <Link href={`${base}/cover`} className={LINK}>
            Cover page and contents
          </Link>
        </li>
        {packet.items.map((item) => (
          <li key={item.versionId}>
            <Link href={`${base}/${item.versionId}`} className={LINK}>
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
