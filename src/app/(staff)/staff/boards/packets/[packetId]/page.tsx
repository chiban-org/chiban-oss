import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { NoPermission } from '@/components/staff/NoPermission'
import { legacyPacketPage } from '@/features/boards/packetsIndex'
import { timeZoneOf } from '@/features/hearings/views'
import { requireStaffContext } from '@/server/requireStaff'
import { getsText, RecipientActions } from '../../meetings/[meetingId]/PacketSend'

export const metadata: Metadata = { title: 'Board packet' }

export const dynamic = 'force-dynamic'

export default async function LegacyPacketPage({
  params,
}: {
  params: Promise<{ packetId: string }>
}) {
  const { packetId } = await params
  const ctx = await requireStaffContext()
  const page = await legacyPacketPage(ctx.db, ctx.actor, packetId, ctx.signal)
  if (!page.ok) return <NoPermission title="Board packet" action="manage board packets" />
  if (page.value.kind === 'redirect') redirect(page.value.href)
  const zone = await timeZoneOf(ctx.db, ctx.signal)
  const now = new Date()
  return (
    <main>
      <p>
        <Link href="/staff/boards/packets">Board packets</Link>
      </p>
      <h1>{page.value.title}</h1>
      <p>{`An older packet for ${page.value.dateText} that belongs to no meeting. Its private links can still be turned off here.`}</p>
      <section aria-labelledby="links">
        <h2 id="links">Private links</h2>
        {page.value.links.length === 0 ? (
          <p>This packet was never sent by private link.</p>
        ) : (
          <ul className="list-none p-0">
            {page.value.links.map((row) => (
              <li
                key={row.key}
                className="record-item flex flex-wrap items-center justify-between gap-2"
              >
                <span>{`${row.name} (${row.email}): ${getsText(row, zone, now)}`}</span>
                <RecipientActions row={row} packetId={packetId} now={now} turnOffOnly />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
