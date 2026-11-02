import Link from 'next/link'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import { stateLabel } from '@/features/applications/stateLabel'
import type { CoreState } from '@/features/applications/states'
import { displayIdsFor } from '@/features/parcels/displayId'
import { requireStaffContext } from '@/server/requireStaff'

const PAGE_SIZE = 25

interface Props {
  searchParams: Promise<{ cursor?: string }>
}

export default async function StaffApplicationsPage({ searchParams }: Props) {
  const { cursor } = await searchParams
  const ctx = await requireStaffContext()
  const page = await listApplicationsForViewer(
    ctx.db,
    ctx.actor,
    { limit: PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
    ctx.signal,
  )
  const display = await displayIdsFor(
    ctx.db,
    page.rows.map((r) => r.parcelId),
  )
  return (
    <main>
      <h1>Applications</h1>
      {page.rows.length === 0 ? (
        <p className="my-4">No applications yet.</p>
      ) : (
        <table className="my-4 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Number</th>
              <th>Project</th>
              <th>Parcel</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2">
                  <Link href={`/staff/applications/${row.id}`} className="text-action underline">
                    {row.number}
                  </Link>
                </td>
                <td>{row.projectTitle}</td>
                <td>
                  <Link href={`/staff/parcels/${row.parcelId}`} className="text-action underline">
                    {display.get(row.parcelId) ?? 'No map-lot ID'}
                  </Link>
                </td>
                <td>{`${stateLabel(row.state as CoreState)}${row.substep === null ? '' : `, ${row.substep.replaceAll('_', ' ')}`}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {page.nextCursor === null ? null : (
        <Link
          href={`/staff/applications?cursor=${encodeURIComponent(page.nextCursor)}`}
          className="text-action underline"
        >
          Next page
        </Link>
      )}
    </main>
  )
}
