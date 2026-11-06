import type { Metadata } from 'next'
import Link from 'next/link'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import type { PacketStateKind } from '@/features/boards/packetState'
import {
  filterPacketRows,
  PACKETS_FILTER_PARAM,
  PACKETS_PATH,
  readPacketsFilter,
  UNSENT_PACKETS,
} from '@/features/boards/packetsFilter'
import { loadPacketsIndex } from '@/features/boards/packetsIndex'
import { type RawSearchParams, readTableParams } from '@/features/dataTable/params'
import { filterTabs } from '@/features/dataTable/quickFilters'
import type { Status } from '@/features/design/tokens'
import { requireStaffContext } from '@/server/requireStaff'

export const metadata: Metadata = { title: 'Board packets' }

export const dynamic = 'force-dynamic'

const CHIP: Record<PacketStateKind, Status> = {
  sent: 'passed',
  changed: 'overdue',
  draft: 'neutral',
  no_agenda: 'neutral',
  cancelled: 'neutral',
}

function NoPackets({ allSent }: { allSent: boolean }) {
  if (allSent) return <p>No packet for an upcoming meeting is waiting to be sent.</p>
  return (
    <p>
      {'No meetings are coming up. '}
      <Link href="/staff/boards/meetings">Add the next meeting</Link>
      {' to prepare its packet.'}
    </p>
  )
}

export default async function PacketsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const raw = await searchParams
  const ctx = await requireStaffContext()
  const index = await loadPacketsIndex(ctx.db, ctx.actor, ctx.signal)
  if (!index.ok) return <NoPermission title="Board packets" action="manage board packets" />
  const filter = readPacketsFilter(raw)
  const upcoming = index.value.meetings
  const rows = filterPacketRows(upcoming, filter)
  const tabs = filterTabs(PACKETS_PATH, readTableParams(raw), {
    param: PACKETS_FILTER_PARAM,
    label: 'Packets',
    defaultTab: 'all',
    options: [
      { value: 'all', label: 'All upcoming', count: upcoming.length },
      {
        value: UNSENT_PACKETS,
        label: 'Not sent yet',
        count: filterPacketRows(upcoming, { unsentOnly: true }).length,
      },
    ],
  })
  return (
    <main data-wide="">
      <h1>Board packets</h1>
      <p>
        Upcoming meetings, soonest first. Each packet is gathered, sent and tracked on its meeting
        page.
      </p>
      {upcoming.length === 0 ? null : <FilterTabs label="Packets" tabs={tabs} />}
      {rows.length === 0 ? (
        <NoPackets allSent={upcoming.length > 0} />
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
              {rows.map((row) => (
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
      {index.value.unlinked.length === 0 ? null : (
        <section aria-labelledby="older-packets">
          <h2 id="older-packets">Older packets not tied to a meeting</h2>
          <ul className="list-none p-0">
            {index.value.unlinked.map((p) => (
              <li key={p.id} className="record-item">
                <Link href={p.href}>{p.title}</Link>
                {`, meeting ${p.dateText}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
