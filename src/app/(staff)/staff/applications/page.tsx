import Link from 'next/link'
import { ApplicationStatusChip } from '@/components/ApplicationStatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import type { CoreState } from '@/features/applications/states'
import { substepLabelsFor } from '@/features/applications/substepLabels'
import { displayIdsFor } from '@/features/parcels/displayId'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { requireStaffContext } from '@/server/requireStaff'

const PAGE_SIZE = 25

interface Props {
  searchParams: Promise<{ cursor?: string }>
}

export default async function StaffApplicationsPage({ searchParams }: Props) {
  const { cursor } = await searchParams
  const ctx = await requireStaffContext()
  if (!mayOpen('/staff/applications', await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Applications" action="see applications" />
  }
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
  const substepLabels = await substepLabelsFor(
    ctx.db,
    page.rows.map((r) => r.id),
    ctx.signal,
  )
  return (
    <main>
      <h1>Applications</h1>
      <p className="mb-6">
        Every application, newest first. To search by number or filter by state, use the{' '}
        <Link href="/staff/queue" className="text-action underline">
          work queue
        </Link>
        .
      </p>
      {page.rows.length === 0 ? (
        <p className="my-4">No applications yet.</p>
      ) : (
        <div className="table-panel">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Number</th>
                <th>Project</th>
                <th>Parcel</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/staff/applications/${row.id}`} className="font-semibold">
                      {row.number}
                    </Link>
                  </td>
                  <td>{row.projectTitle}</td>
                  <td>
                    <Link href={`/staff/parcels/${row.parcelId}`} className="tabular-nums">
                      {display.get(row.parcelId) ?? 'No map-lot ID'}
                    </Link>
                  </td>
                  <td>
                    <ApplicationStatusChip
                      state={row.state as CoreState}
                      substep={row.substep}
                      substepLabel={row.substep === null ? null : (substepLabels.get(row.id) ?? '')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
