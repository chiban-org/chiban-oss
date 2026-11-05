import Link from 'next/link'
import { RecentParcelSearches } from '@/components/parcels/RecentParcelSearches'
import { SearchExamples } from '@/components/parcels/SearchExamples'
import { TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import type { SearchExample } from '@/features/parcels/searchExample'

export interface ParcelHit {
  parcelId: string
  displayId: string | null
  siteAddress: string | null
  ownerName: string | null
}

function SearchNotice({ q, hitCount }: { q: string; hitCount: number }) {
  const length = q.trim().length
  if (length === 0 || (length >= 2 && hitCount > 0)) return null
  return <p>{length < 2 ? 'Enter at least two characters.' : 'No parcels match that search.'}</p>
}

function ParcelHits({
  hits,
  hrefFor,
}: {
  hits: readonly ParcelHit[]
  hrefFor: (parcelId: string) => string
}) {
  if (hits.length === 0) return null
  return (
    <ul className="divide-y rounded-md border">
      {hits.map((hit) => (
        <li key={hit.parcelId}>
          <Link
            href={hrefFor(hit.parcelId)}
            className="grid gap-x-4 px-4 py-2.5 text-ink no-underline hover:bg-canvas sm:grid-cols-[9rem_14rem_1fr]"
          >
            <span className="font-semibold text-action underline">
              {hit.displayId ?? 'No map-lot ID'}
            </span>
            <span>{hit.siteAddress ?? 'No site address'}</span>
            {hit.ownerName === null ? null : (
              <span className="text-muted-foreground">{hit.ownerName}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function CounterParcelSearch({
  q,
  typeKey,
  hits,
  example,
  userId,
  hrefFor,
}: {
  q: string
  typeKey: string
  hits: readonly ParcelHit[]
  example: SearchExample | null
  userId: string
  hrefFor: (parcelId: string) => string
}) {
  const query = { type: typeKey }
  return (
    <section aria-labelledby="parcel" className="space-y-3">
      <h2 id="parcel">Parcel</h2>
      <form method="get" role="search" className="flex max-w-3xl gap-3">
        <input type="hidden" name="type" value={typeKey} />
        <div className="flex-1">
          <TextField label="Search by parcel ID, address, or owner" name="q" defaultValue={q} />
        </div>
        <Button type="submit" className="self-end">
          Search
        </Button>
      </form>
      <SearchExamples example={example} hrefBase="/staff/counter" query={query} />
      <RecentParcelSearches
        userId={userId}
        record={hits.length > 0 ? q.trim() : null}
        hrefBase="/staff/counter"
        query={query}
      />
      <SearchNotice q={q} hitCount={hits.length} />
      <ParcelHits hits={hits} hrefFor={hrefFor} />
    </section>
  )
}
