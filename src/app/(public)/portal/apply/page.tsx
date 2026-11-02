import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { parcels } from '@/db/schema'
import { displayIdsFor } from '@/features/parcels/displayId'
import { searchParcels } from '@/features/parcels/searchParcels'
import { listPortalTypes, RETIRED_PARCEL_COPY } from '@/features/portal/drafts'
import { requirePortalContext } from '@/server/requirePortal'
import { isUuid } from '@/utils/uuid'
import { startApplicationAction } from './actions'

export const dynamic = 'force-dynamic'

const LINK = 'tap-target inline-flex items-center underline'
const MIN_QUERY = 2

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; parcel?: string }>
}) {
  const { q = '', parcel } = await searchParams
  const ctx = await requirePortalContext('/portal/apply')
  const parcelId = parcel !== undefined && isUuid(parcel) ? parcel : null
  if (parcelId !== null) {
    const [types, display, [chosen]] = await Promise.all([
      listPortalTypes(ctx.db, ctx.signal),
      displayIdsFor(ctx.db, [parcelId]),
      ctx.db.select({ status: parcels.status }).from(parcels).where(eq(parcels.id, parcelId)),
    ])
    if (chosen?.status === 'retired') {
      return (
        <main className="space-y-4">
          <h1>Choose the kind of application</h1>
          <p role="alert">{RETIRED_PARCEL_COPY}</p>
          <Link href="/portal/apply" className={LINK}>
            Choose a different parcel
          </Link>
        </main>
      )
    }
    return (
      <main className="space-y-4">
        <h1>Choose the kind of application</h1>
        <p>{`Parcel ${display.get(parcelId) ?? ''}`}</p>
        <ActionForm action={startApplicationAction} submitLabel="Continue" variant="default">
          <input type="hidden" name="parcelId" value={parcelId} />
          <fieldset className="space-y-2 border-0 p-0">
            <legend className="font-medium">Application type</legend>
            <RadioGroup name="typeKey" defaultValue={types[0]?.key} className="gap-1">
              {types.map((t) => (
                <div key={t.key} className="flex min-h-11 items-center gap-3">
                  <RadioGroupItem id={`type-${t.key}`} value={t.key} />
                  <Label htmlFor={`type-${t.key}`} className="text-base">
                    {t.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
        </ActionForm>
        <Link href="/portal/apply" className={LINK}>
          Choose a different parcel
        </Link>
      </main>
    )
  }
  const query = q.trim()
  const hits =
    query.length >= MIN_QUERY ? await searchParcels(ctx.db, { q: query }, ctx.signal) : []
  const display = await displayIdsFor(
    ctx.db,
    hits.map((h) => h.parcelId),
  )
  return (
    <main className="space-y-4">
      <h1>Start an application</h1>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="parcel-search" className="text-base">
            Find your parcel by address, owner, or parcel ID
          </Label>
          <Input id="parcel-search" name="q" defaultValue={query} className="min-h-11 text-base" />
        </div>
        <Button type="submit" variant="outline" className="min-h-11 text-base">
          Search
        </Button>
      </form>
      {query.length > 0 && query.length < MIN_QUERY ? <p>Enter at least two characters.</p> : null}
      {query.length >= MIN_QUERY && hits.length === 0 ? <p>No parcels match that search.</p> : null}
      <ul className="m-0 list-none divide-y p-0">
        {hits.map((h) => (
          <li key={h.parcelId} className="py-2">
            {h.status === 'retired' ? (
              <p className="m-0">
                {`${h.siteAddress ?? 'Address not on file'}, parcel ${display.get(h.parcelId) ?? ''}. Retired: takes no new applications.`}
              </p>
            ) : (
              <Link href={`/portal/apply?parcel=${h.parcelId}`} className={LINK}>
                {`${h.siteAddress ?? 'Address not on file'}, parcel ${display.get(h.parcelId) ?? ''}`}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
