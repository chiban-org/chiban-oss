import { inArray } from 'drizzle-orm'
import Link from 'next/link'
import { NoPermission } from '@/components/staff/NoPermission'
import { users } from '@/db/schema'
import { listTombstones, type TombstoneRow } from '@/features/disposition/tombstones'
import { getTownSettings } from '@/features/town/settings'
import { formatInstantDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const KIND = { document: 'Document', application_snapshot: 'Application snapshot' } as const

function Citation({ citation }: { citation: TombstoneRow['citation'] }) {
  return citation.url === null ? (
    citation.label
  ) : (
    <a href={citation.url} className="text-action underline">
      {citation.label}
    </a>
  )
}

export default async function DisposedRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>
}) {
  const { cursor } = await searchParams
  const ctx = await requireStaffContext()
  const list = await listTombstones(
    ctx.db,
    ctx.actor,
    { limit: PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
    ctx.signal,
  )
  if (!list.ok) return <NoPermission title="Disposed records" action="see disposed records" />
  const ids = [...new Set(list.value.rows.flatMap((r) => [r.proposedBy, r.approvedBy]))]
  const people =
    ids.length === 0
      ? []
      : await ctx.db
          .select({ id: users.id, name: users.displayName })
          .from(users)
          .where(inArray(users.id, ids))
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Staff'
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : 'America/New_York'
  return (
    <main className="space-y-6">
      <h1>Disposed records</h1>
      <p className="m-0">
        Each record disposed of under its retention schedule leaves a tombstone: what it was, the
        series that allowed it, and who proposed and approved it. The record itself is gone, so this
        list is read-only.
      </p>
      {list.value.rows.length === 0 ? (
        <p>No record has been disposed of.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col">Record</th>
              <th scope="col">Kind</th>
              <th scope="col">Retention series</th>
              <th scope="col">Disposed of</th>
              <th scope="col">Proposed and approved by</th>
            </tr>
          </thead>
          <tbody>
            {list.value.rows.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{KIND[r.recordKind]}</td>
                <td>
                  {`${r.seriesLabel} `}
                  <Citation citation={r.citation} />
                </td>
                <td>
                  <Link
                    href={`/staff/records/disposition/${r.batchId}`}
                    className="text-action underline"
                  >
                    {formatInstantDate(r.executedAt, zone)}
                  </Link>
                </td>
                <td>{`${nameOf(r.proposedBy)}, ${nameOf(r.approvedBy)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.value.nextCursor === null ? null : (
        <Link
          href={`/staff/records/disposed?cursor=${list.value.nextCursor}`}
          className="text-action underline"
        >
          Older disposed records
        </Link>
      )}
    </main>
  )
}
