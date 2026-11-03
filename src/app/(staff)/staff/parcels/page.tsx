import Link from 'next/link'
import { MoreMatchesNotice } from '@/components/parcels/MoreMatchesNotice'
import { RecentParcelSearches } from '@/components/parcels/RecentParcelSearches'
import { Button } from '@/components/ui/button'
import { type SearchExample, searchExample } from '@/features/parcels/searchExample'
import { searchParcelPage } from '@/features/parcels/searchParcels'
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

function SearchExamples({ example }: { example: SearchExample | null }) {
  if (example === null) return null
  const tries = [example.address, example.displayId].filter((v): v is string => v !== null)
  if (tries.length === 0) return null
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-muted-foreground">Try</span>
      {tries.map((value) => (
        <Link key={value} href={`/staff/parcels?q=${encodeURIComponent(value)}`}>
          {value}
        </Link>
      ))}
    </p>
  )
}

export default async function StaffParcelsPage({ searchParams }: ParcelsPageProps) {
  const { q = '' } = await searchParams
  const ctx = await requireStaffContext()
  const [{ hits, more }, example] = await Promise.all([
    searchParcelPage(ctx.db, q, ctx.signal),
    searchExample(ctx.db, ctx.signal),
  ])
  const searched = q.trim().length >= 2 && hits.length > 0 ? q.trim() : null
  return (
    <main>
      <h1>Parcels</h1>
      <form method="get" role="search" className="mt-4 mb-3 flex gap-3">
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
      <div className="mb-6 flex flex-col gap-3">
        <SearchExamples example={example} />
        <RecentParcelSearches
          userId={ctx.actor.userId}
          record={searched}
          hrefBase="/staff/parcels"
        />
      </div>
      {q.trim().length < 2 ? (
        <p className="text-muted-foreground">Enter at least two characters.</p>
      ) : hits.length === 0 ? (
        <p>No parcels match that search.</p>
      ) : (
        <>
          <MoreMatchesNotice more={more} />
          <div className="table-panel">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>Parcel</th>
                  <th>Address</th>
                  <th>Owner</th>
                  <th>Matched on</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => (
                  <tr key={hit.parcelId}>
                    <td>
                      <Link
                        href={`/staff/parcels/${hit.parcelId}`}
                        className="font-semibold tabular-nums"
                      >
                        {hit.displayId ?? 'No map-lot ID'}
                      </Link>
                      {hit.status === 'retired' ? <span className="ml-2">Retired</span> : null}
                    </td>
                    <td>{hit.siteAddress ?? 'Unknown'}</td>
                    <td>
                      {hit.ownerName === null ? (
                        'Unknown'
                      ) : (
                        <Link
                          href={`/staff/parcels?q=${encodeURIComponent(hit.ownerName)}`}
                          aria-label={`Search parcels owned by ${hit.ownerName}`}
                        >
                          {hit.ownerName}
                        </Link>
                      )}
                    </td>
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
          </div>
        </>
      )}
    </main>
  )
}
