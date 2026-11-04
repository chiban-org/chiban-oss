import Link from 'next/link'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { MoreMatchesNotice } from '@/components/parcels/MoreMatchesNotice'
import { RecentParcelSearches } from '@/components/parcels/RecentParcelSearches'
import { SearchExamples } from '@/components/parcels/SearchExamples'
import { TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'
import { clearHref, paramValues, type RawSearchParams } from '@/features/dataTable/params'
import { DIR_PARAM, SORT_PARAM, sortLinks } from '@/features/dataTable/sort'
import { arrangeHits, hitFacets } from '@/features/parcels/hitList'
import { hitChipGroups } from '@/features/parcels/hitListChips'
import {
  HIT_FILTER_PARAMS,
  HIT_SORT,
  MATCH_LABELS,
  PARCELS_PATH,
  readHitsView,
} from '@/features/parcels/hitListParams'
import { searchExample } from '@/features/parcels/searchExample'
import { searchParcelPage } from '@/features/parcels/searchParcels'
import { requireStaffContext } from '@/server/requireStaff'

interface ParcelsPageProps {
  searchParams: Promise<RawSearchParams>
}

const CARRIED_PARAMS = [SORT_PARAM, DIR_PARAM, ...HIT_FILTER_PARAMS]

export default async function StaffParcelsPage({ searchParams }: ParcelsPageProps) {
  const { q, params, sort, filters } = readHitsView(await searchParams)
  const ctx = await requireStaffContext()
  const [{ hits, more }, example] = await Promise.all([
    searchParcelPage(ctx.db, q, ctx.signal),
    searchExample(ctx.db, ctx.signal),
  ])
  const shown = arrangeHits(hits, sort, filters)
  const links = sortLinks(PARCELS_PATH, params, HIT_SORT, sort)
  const clear = clearHref(PARCELS_PATH, params, HIT_FILTER_PARAMS)
  const searched = q.trim().length >= 2 && hits.length > 0 ? q.trim() : null
  return (
    <main data-wide="">
      <h1>Parcels</h1>
      <form method="get" role="search" className="mt-4 mb-3 flex gap-3">
        <div className="flex-1">
          <TextField label="Search by parcel ID, address, or owner" name="q" defaultValue={q} />
        </div>
        {CARRIED_PARAMS.flatMap((name) =>
          paramValues(params, name).map((value) => (
            <input key={`${name}:${value}`} type="hidden" name={name} value={value} />
          )),
        )}
        <Button type="submit" className="self-end">
          Search
        </Button>
      </form>
      <div className="mb-6 flex flex-col gap-3">
        <SearchExamples example={example} hrefBase={PARCELS_PATH} />
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
          <p className="text-muted-foreground">
            Best matches first. Click a column heading to sort.
          </p>
          <MoreMatchesNotice more={more} />
          <div className="toolbar">
            <QuickFilters
              label="Quick filters"
              groups={hitChipGroups(params, hitFacets(hits, filters))}
              clearHref={clear}
            />
          </div>
          <div className="table-panel">
            {shown.length === 0 ? (
              <p className="px-5 py-8">No parcels match these filters.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <SortHeader label="Parcel" link={links.parcel} />
                    <SortHeader label="Address" link={links.address} />
                    <SortHeader label="Owner" link={links.owner} />
                    <SortHeader label="Matched on" link={links.matched} />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((hit) => (
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
                        {MATCH_LABELS.get(hit.matchedOn)}
                        {hit.matchedAlias === null
                          ? null
                          : ` (${hit.matchedAlias.value}${hit.matchedAlias.status === 'retired' ? ', retired ID' : ''})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </main>
  )
}
