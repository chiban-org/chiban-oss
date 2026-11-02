import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { searchParcels } from '@/features/parcels/searchParcels'
import { requireStaffContext } from '@/server/requireStaff'

interface ParcelsPageProps {
  searchParams: Promise<{ q?: string }>
}

const MATCH_LABEL = {
  alias_exact: 'ID match',
  alias_prefix: 'ID starts with',
  address: 'Address',
  owner: 'Owner',
} as const

export default async function StaffParcelsPage({ searchParams }: ParcelsPageProps) {
  const { q = '' } = await searchParams
  const ctx = await requireStaffContext()
  const hits = await searchParcels(ctx.db, { q }, ctx.signal)
  return (
    <main>
      <h1>Parcels</h1>
      <form method="get" role="search" className="my-4 flex gap-3">
        <label className="flex-1 text-sm font-medium">
          Search by parcel ID, address, or owner
          <input
            name="q"
            defaultValue={q}
            className="mt-1 block w-full rounded-md border bg-surface px-3 py-2"
          />
        </label>
        <Button type="submit" className="self-end">
          Search
        </Button>
      </form>
      {q.trim().length < 2 ? (
        <p className="text-muted-foreground">Enter at least two characters.</p>
      ) : hits.length === 0 ? (
        <p>No parcels match that search.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Parcel</th>
              <th>Address</th>
              <th>Owner</th>
              <th>Matched on</th>
            </tr>
          </thead>
          <tbody>
            {hits.map((hit) => (
              <tr key={hit.parcelId} className="border-b">
                <td className="py-2">
                  <Link
                    href={`/staff/parcels/${hit.parcelId}`}
                    className="font-semibold text-action underline"
                  >
                    {hit.displayId ?? 'No map-lot ID'}
                  </Link>
                  {hit.status === 'retired' ? <span className="ml-2">Retired</span> : null}
                </td>
                <td>{hit.siteAddress ?? 'Unknown'}</td>
                <td>{hit.ownerName ?? 'Unknown'}</td>
                <td>
                  {MATCH_LABEL[hit.matchedOn]}
                  {hit.matchedAlias === null
                    ? null
                    : ` (${hit.matchedAlias.value}${hit.matchedAlias.status === 'retired' ? ', retired ID' : ''})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
