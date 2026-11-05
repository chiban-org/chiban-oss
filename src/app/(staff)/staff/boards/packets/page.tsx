import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import type { PacketStateKind } from '@/features/boards/packetState'
import { loadPacketsIndex } from '@/features/boards/packetsIndex'
import type { Status } from '@/features/design/tokens'
import { requireStaffContext } from '@/server/requireStaff'

export const dynamic = 'force-dynamic'

const CHIP: Record<PacketStateKind, Status> = {
  sent: 'passed',
  changed: 'overdue',
  draft: 'neutral',
  no_agenda: 'neutral',
  cancelled: 'neutral',
}

export default async function PacketsPage() {
  const ctx = await requireStaffContext()
  const rows = await loadPacketsIndex(ctx.db, ctx.actor, ctx.signal)
  if (!rows.ok) return <NoPermission title="Board packets" action="manage board packets" />
  return (
    <main data-wide="">
      <h1>Board packets</h1>
      <p>
        Upcoming meetings, soonest first. Each packet is gathered, sent and tracked on its meeting
        page.
      </p>
      {rows.value.length === 0 ? (
        <p>
          {'No meetings are coming up. '}
          <Link href="/staff/boards/meetings">Add the next meeting</Link>
          {' to prepare its packet.'}
        </p>
      ) : (
        <div className="table-panel">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">Packets for upcoming meetings</caption>
            <thead>
              <tr>
                <th scope="col">Meeting</th>
                <th scope="col">Board</th>
                <th scope="col">Packet</th>
              </tr>
            </thead>
            <tbody>
              {rows.value.map((row) => (
                <tr key={row.meetingId}>
                  <td className="whitespace-nowrap">
                    <Link href={row.href} className="font-semibold">
                      {row.dateText}
                    </Link>
                    {row.kindText === 'Special meeting' ? (
                      <span className="block text-muted-foreground">Special meeting</span>
                    ) : null}
                  </td>
                  <td>{row.boardName}</td>
                  <td>
                    <StatusChip status={CHIP[row.stateKind]} label={row.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
