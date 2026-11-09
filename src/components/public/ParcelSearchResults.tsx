import Link from 'next/link'
import { MoreMatchesNotice } from '@/components/parcels/MoreMatchesNotice'
import { StatusChip } from '@/components/StatusChip'
import type { ParcelSearchHit } from '@/features/parcels/searchParcels'

const MIN_QUERY_CHARS = 2

function HitRow({ hit }: { hit: ParcelSearchHit }) {
  const details = [hit.displayId === null ? null : `Map-lot ${hit.displayId}`, hit.ownerName]
  return (
    <li className="record-item flex flex-wrap items-start justify-between gap-x-4 gap-y-1 pb-3">
      <div className="flex min-w-0 flex-col">
        <Link
          href={`/parcels/${hit.parcelId}`}
          className="tap-target inline-flex items-center self-start font-serif text-xl font-semibold"
        >
          {hit.siteAddress ?? 'No site address on file'}
        </Link>
        <span className="text-ink-secondary">
          {details.filter((d): d is string => d !== null && d !== '').join(' · ')}
        </span>
        {hit.matchedAlias?.status === 'retired' ? (
          <span className="text-muted-foreground">{`Matched the retired ID ${hit.matchedAlias.value}`}</span>
        ) : null}
      </div>
      {hit.status === 'retired' ? <StatusChip status="neutral" label="Retired" /> : null}
    </li>
  )
}

export function ParcelSearchResults({
  q,
  hits,
  more,
}: {
  q: string
  hits: readonly ParcelSearchHit[]
  more: boolean
}) {
  if (q === '') return null
  if (q.trim().length < MIN_QUERY_CHARS) return <p role="status">Enter at least two characters.</p>
  if (hits.length === 0) {
    return (
      <div role="status" className="flex flex-col gap-1">
        <p className="m-0 font-semibold">No parcels match that search.</p>
        <p className="m-0 max-w-[65ch]">
          Check the spelling, or search with less: only the street name, the owner&apos;s last name,
          or the map-lot ID.
        </p>
      </div>
    )
  }
  return (
    <section aria-labelledby="parcel-results-heading">
      <h2 id="parcel-results-heading">
        {hits.length === 1 ? '1 parcel' : `${hits.length} parcels`}
      </h2>
      <MoreMatchesNotice more={more} />
      <ul className="list-none p-0">
        {hits.map((hit) => (
          <HitRow key={hit.parcelId} hit={hit} />
        ))}
      </ul>
    </section>
  )
}
