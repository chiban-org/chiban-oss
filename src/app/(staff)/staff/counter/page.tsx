import { NH_LICENSE_LOOKUP } from '@packs/nh/links'
import Link from 'next/link'
import { ParcelSearchHotkey } from '@/components/counter/ParcelSearchHotkey'
import { QuickIssueForm } from '@/components/counter/QuickIssueForm'
import { Button } from '@/components/ui/button'
import { hasCapability } from '@/features/authz/capabilities'
import { loadCounterFormData } from '@/features/counter/counterFormData'
import { listDirectIssueTypes } from '@/features/counter/directIssueTypes'
import { displayIdsFor } from '@/features/parcels/displayId'
import { searchParcels } from '@/features/parcels/searchParcels'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import {
  checkAction,
  completeAction,
  quickIssueAction,
  readerAction,
  reconnectAction,
} from './actions'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ q?: string; parcel?: string; type?: string }>
}

const actions = {
  issue: quickIssueAction,
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

export default async function CounterPage({ searchParams }: Props) {
  const { q = '', parcel, type } = await searchParams
  const ctx = await requireStaffContext()
  const allowed =
    (await hasCapability(ctx.db, ctx.actor.userId, 'permit.issue', ctx.signal)) &&
    (await hasCapability(ctx.db, ctx.actor.userId, 'payment.collect', ctx.signal))
  if (!allowed) {
    return (
      <main>
        <h1>Counter</h1>
        <p role="alert">You do not have permission to issue permits at the counter.</p>
      </main>
    )
  }
  const types = await listDirectIssueTypes(ctx.db, ctx.signal)
  const selectedType = types.find((t) => t.key === type)
  const hits = q.trim().length >= 2 ? await searchParcels(ctx.db, { q }, ctx.signal) : []
  const parcelId = parcel !== undefined && isUuid(parcel) ? parcel : undefined
  const display = await displayIdsFor(ctx.db, [
    ...hits.map((h) => h.parcelId),
    ...(parcelId === undefined ? [] : [parcelId]),
  ])

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
    <main className="space-y-6">
      <ParcelSearchHotkey />
      <h1>Counter</h1>
      <section aria-labelledby="parcel" className="space-y-3">
        <h2 id="parcel">Parcel</h2>
        <form method="get" role="search" className="flex gap-3">
          <input type="hidden" name="type" value={selectedType?.key ?? ''} />
          <label className="flex-1 text-sm font-medium">
            Search by parcel ID, address, or owner (press / to search)
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
        {parcelId === undefined ? null : (
          <p>
            Selected parcel: <strong>{display.get(parcelId) ?? 'No map-lot ID'}</strong>
          </p>
        )}
        <SearchNotice q={q} hitCount={hits.length} />
        <ul className="space-y-1">
          {hits.map((hit) => (
            <li key={hit.parcelId}>
              <Link
                href={href({ q, parcel: hit.parcelId, type: selectedType?.key })}
                className="text-action underline"
              >
                {hit.displayId ?? 'No map-lot ID'}
              </Link>{' '}
              {hit.siteAddress ?? ''}
              {hit.ownerName === null ? '' : `, ${hit.ownerName}`}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="permit-type" className="space-y-2">
        <h2 id="permit-type">Permit type</h2>
        <ul className="flex flex-wrap gap-3">
          {types.map((t) => (
            <li key={t.key}>
              <Link
                href={href({ q, parcel: parcelId, type: t.key })}
                aria-current={t.key === selectedType?.key ? 'true' : undefined}
                className={
                  t.key === selectedType?.key ? 'font-semibold underline' : 'text-action underline'
                }
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
        {types.length === 0 ? <p>No permit type is set up for counter issue.</p> : null}
      </section>
      {form ?? (
        <p className="text-muted-foreground">Choose a parcel and a permit type to continue.</p>
      )}
    </main>
  )
}
