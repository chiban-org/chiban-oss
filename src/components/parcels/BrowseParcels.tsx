import Link from 'next/link'
import { TablePager, type TablePagerProps } from '@/components/dataTable/TablePager'
import type { BrowsedParcel } from '@/features/parcels/browseParcels'

export function BrowseParcels({
  rows,
  pager,
}: {
  rows: readonly BrowsedParcel[]
  pager: TablePagerProps
}) {
  if (rows.length === 0) return <p>No parcels have been imported yet.</p>
  return (
    <section data-plain="" aria-labelledby="all-parcels">
      <h2 id="all-parcels">All parcels</h2>
      <p className="text-muted-foreground">In parcel ID order. Search above to narrow the list.</p>
      <div className="table-panel">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th scope="col">Parcel</th>
              <th scope="col">Address</th>
              <th scope="col">Owner</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.parcelId}>
                <td>
                  <Link
                    href={`/staff/parcels/${row.parcelId}`}
                    className="font-semibold tabular-nums"
                  >
                    {row.displayId ?? 'No map-lot ID'}
                  </Link>
                  {row.status === 'retired' ? <span className="ml-2">Retired</span> : null}
                </td>
                <td>{row.siteAddress ?? 'Unknown'}</td>
                <td>{row.ownerName ?? 'Unknown'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePager {...pager} />
    </section>
  )
}
