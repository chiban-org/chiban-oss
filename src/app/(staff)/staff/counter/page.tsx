import { NH_LICENSE_LOOKUP } from '@packs/nh/links'
import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { ParcelSearchHotkey } from '@/components/counter/ParcelSearchHotkey'
import { QuickIssueForm } from '@/components/counter/QuickIssueForm'
import { KeyHints } from '@/components/KeyHints'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecentParcelSearches } from '@/components/parcels/RecentParcelSearches'
import { SearchExamples } from '@/components/parcels/SearchExamples'
import { TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { Button } from '@/components/ui/button'
import { parcels } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { loadCounterFormData } from '@/features/counter/counterFormData'
import { listDirectIssueTypes } from '@/features/counter/directIssueTypes'
import { displayIdsFor } from '@/features/parcels/displayId'
import { type SearchExample, searchExample } from '@/features/parcels/searchExample'
import { searchParcels } from '@/features/parcels/searchParcels'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import {
  checkAction,
  completeAction,
  quickIssueAction,
  readerAction,
  reconnectAction,
  sendClaimAction,
} from './actions'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ q?: string; parcel?: string; type?: string }>
}

const actions = {
  issue: quickIssueAction,
  claim: sendClaimAction,
  reader: readerAction,
  check: checkAction,
  reconnect: reconnectAction,
  complete: completeAction,
}

function href(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, value)
  }
  return `/staff/counter?${query.toString()}`
}

function SearchNotice({ q, hitCount }: { q: string; hitCount: number }) {
  const length = q.trim().length
  if (length === 0 || (length >= 2 && hitCount > 0)) return null
  return <p>{length < 2 ? 'Enter at least two characters.' : 'No parcels match that search.'}</p>
}

interface ParcelHit {
  parcelId: string
  displayId: string | null
  siteAddress: string | null
  ownerName: string | null
}

function ParcelHits({
  hits,
  selected,
  hrefFor,
}: {
  hits: readonly ParcelHit[]
  selected: string | undefined
  hrefFor: (parcelId: string) => string
}) {
  if (hits.length === 0) return null
  return (
    <ul className="divide-y rounded-md border">
      {hits.map((hit) => (
        <li key={hit.parcelId}>
          <Link
            href={hrefFor(hit.parcelId)}
            aria-current={hit.parcelId === selected ? 'true' : undefined}
            className="grid gap-x-4 px-4 py-2.5 text-ink no-underline hover:bg-canvas aria-[current=true]:bg-canvas sm:grid-cols-[9rem_14rem_1fr]"
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

function SearchHelp({
  example,
  userId,
  q,
  hitCount,
  typeKey,
}: {
  example: SearchExample | null
  userId: string
  q: string
  hitCount: number
  typeKey: string | undefined
}) {
  const query = typeKey === undefined ? undefined : { type: typeKey }
  return (
    <>
      <SearchExamples example={example} hrefBase="/staff/counter" query={query} />
      <RecentParcelSearches
        userId={userId}
        record={hitCount > 0 ? q.trim() : null}
        hrefBase="/staff/counter"
        query={query}
      />
    </>
  )
}

export default async function CounterPage({ searchParams }: Props) {
  const { q = '', parcel, type } = await searchParams
  const ctx = await requireStaffContext()
  const allowed =
    (await hasCapability(ctx.db, ctx.actor.userId, 'permit.issue', ctx.signal)) &&
    (await hasCapability(ctx.db, ctx.actor.userId, 'payment.collect', ctx.signal))
  if (!allowed) return <NoPermission title="Counter" action="issue permits at the counter" />
  const [types, example] = await Promise.all([
    listDirectIssueTypes(ctx.db, ctx.signal),
    searchExample(ctx.db, ctx.signal),
  ])
  const selectedType = types.find((t) => t.key === type)
  const hits = q.trim().length >= 2 ? await searchParcels(ctx.db, { q }, ctx.signal) : []
  const parcelId = parcel !== undefined && isUuid(parcel) ? parcel : undefined
  const display = await displayIdsFor(ctx.db, [
    ...hits.map((h) => h.parcelId),
    ...(parcelId === undefined ? [] : [parcelId]),
  ])

  const [selectedParcel] =
    parcelId === undefined
      ? []
      : await ctx.db
          .select({ siteAddress: parcels.siteAddress })
          .from(parcels)
          .where(eq(parcels.id, parcelId))

  const formData =
    parcelId !== undefined && selectedType !== undefined
      ? await loadCounterFormData(ctx.db, selectedType.key, ctx.signal)
      : null
  const form =
    parcelId !== undefined && selectedType !== undefined ? (
      formData === null ? (
        <p role="alert">
          This permit type has no published form or a fee that cannot be worked out yet.
        </p>
      ) : (
        <QuickIssueForm
          parcelId={parcelId}
          typeKey={selectedType.key}
          typeLabel={selectedType.label}
          lookup={NH_LICENSE_LOOKUP}
          actions={actions}
          {...formData}
        />
      )
    ) : null

  return (
    <main>
      <ParcelSearchHotkey />
      <PageHeader title="Counter" lead="Find the parcel, then choose the permit type." />
      <KeyHints hints={[{ keys: ['/'], action: 'search for a parcel' }]} />
      <section aria-labelledby="parcel" className="space-y-3">
        <h2 id="parcel">Parcel</h2>
        <form method="get" role="search" className="flex max-w-3xl gap-3">
          <input type="hidden" name="type" value={selectedType?.key ?? ''} />
          <div className="flex-1">
            <TextField label="Search by parcel ID, address, or owner" name="q" defaultValue={q} />
          </div>
          <Button type="submit" className="self-end">
            Search
          </Button>
        </form>
        <SearchHelp
          example={example}
          userId={ctx.actor.userId}
          q={q}
          hitCount={hits.length}
          typeKey={selectedType?.key}
        />
        {parcelId === undefined ? null : (
          <p className="rounded-md border border-action bg-canvas px-4 py-3">
            Selected parcel: <strong>{display.get(parcelId) ?? 'No map-lot ID'}</strong>
            {`, ${selectedParcel?.siteAddress ?? 'No site address'}`}
          </p>
        )}
        <SearchNotice q={q} hitCount={hits.length} />
        <ParcelHits
          hits={hits}
          selected={parcelId}
          hrefFor={(id) => href({ q, parcel: id, type: selectedType?.key })}
        />
      </section>
      <section aria-labelledby="permit-type" className="space-y-2">
        <h2 id="permit-type">Permit type</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((t) => (
            <li key={t.key}>
              <Button
                asChild
                variant="outline"
                className="h-auto min-h-11 w-full justify-start font-normal whitespace-normal no-underline hover:border-action aria-[current=true]:border-2 aria-[current=true]:border-action aria-[current=true]:bg-canvas aria-[current=true]:font-semibold"
              >
                <Link
                  href={href({ q, parcel: parcelId, type: t.key })}
                  aria-current={t.key === selectedType?.key ? 'true' : undefined}
                >
                  {t.label}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
        {types.length === 0 ? <p>No permit type is set up for counter issue.</p> : null}
      </section>
      {form ?? (
        <p className="rounded-md border border-dashed px-6 py-8 text-center text-muted-foreground">
          Choose a parcel and a permit type to continue.
        </p>
      )}
    </main>
  )
}
