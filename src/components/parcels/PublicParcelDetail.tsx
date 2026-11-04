import Link from 'next/link'
import { LinkedParcelMap } from '@/components/map/LinkedParcelMap'
import { HonestText } from '@/components/parcels/HonestText'
import { RecordsSection } from '@/components/parcels/RecordsSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Bbox } from '@/features/gis/extent'
import type { PublicParcelView } from '@/features/parcels/publicParcelView'
import { formatCivilDate, formatInstantDate } from '@/lib/formatDate'

interface PublicParcelDetailProps {
  view: PublicParcelView
  timeZone: string
  overlays: ('roads' | 'water')[]
  basemap: { rasterUrl: string | null; attribution: string | null } | null
  bbox?: Bbox | null
}

export function ParcelSearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  return (
    <form
      method="get"
      action="/parcels"
      role="search"
      className="mb-6 flex flex-col gap-3 sm:flex-row"
    >
      <div className="grid flex-1 gap-2">
        <Label htmlFor="parcel-search" className="text-base">
          Find a parcel by ID, address, or owner
        </Label>
        <Input
          id="parcel-search"
          name="q"
          defaultValue={defaultValue}
          className="h-11 text-base md:text-base"
        />
      </div>
      <Button type="submit" size="lg" className="h-11 text-base sm:self-end">
        Search
      </Button>
    </form>
  )
}

function Banner({ view, timeZone }: { view: PublicParcelView; timeZone: string }) {
  const { layer } = view
  const last =
    layer.lastSuccessAt === null ? null : formatInstantDate(new Date(layer.lastSuccessAt), timeZone)
  let text: string | null = null
  if (layer.state === 'stale' && last !== null)
    text = `Parcel data last imported ${last}. It may be out of date.`
  if (layer.state === 'import_failed') {
    text = `The latest update of parcel data failed. ${last === null ? 'No earlier import is on file.' : `Information shown was last imported ${last} and may be out of date.`}`
  }
  if (layer.state === 'never_imported') text = 'Parcel data has not been loaded yet.'
  if (text === null) return null
  return (
    <p role="status" className="my-4 rounded-md bg-highlight px-4 py-3 text-base">
      {text}
    </p>
  )
}

export function PublicParcelDetail({
  view,
  timeZone,
  overlays,
  basemap,
  bbox,
}: PublicParcelDetailProps) {
  const display = view.ids.find((i) => !i.retired) ?? view.ids[0]
  return (
    <main className="text-base">
      <ParcelSearchBox />
      <h1>{display?.value ?? 'Parcel'}</h1>
      {view.status === 'retired' ? (
        <p className="font-semibold">
          {`Retired ${view.retiredOn === null ? '' : formatCivilDate(view.retiredOn)}`.trim()}
        </p>
      ) : null}
      <Banner view={view} timeZone={timeZone} />
      <dl className="my-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold">Site address</dt>
        <dd>
          <HonestText value={view.siteAddress} timeZone={timeZone} />
        </dd>
        <dt className="font-semibold">Owner of record</dt>
        <dd>
          <HonestText value={view.owner} timeZone={timeZone} />
        </dd>
        <dt className="font-semibold">Area</dt>
        <dd>
          <HonestText value={view.areaAcres} format={(n) => `${n} acres`} timeZone={timeZone} />
        </dd>
        <dt className="font-semibold">Parcel IDs</dt>
        <dd>
          <ul>
            {view.ids.map((id) => (
              <li key={`${id.label}:${id.value}`}>
                {id.retired ? `${id.value} (retired ID)` : id.value}
                <span className="ml-2 text-muted-foreground">{id.label}</span>
              </li>
            ))}
          </ul>
        </dd>
      </dl>
      {view.lineage.parents.length + view.lineage.children.length === 0 ? null : (
        <section aria-labelledby="lineage-heading" className="my-6">
          <h2 id="lineage-heading">Where this parcel came from</h2>
          <ul>
            {view.lineage.parents.map((p) => (
              <li key={`p${p.eventId}${p.parcelId}`}>
                {'Parent lot '}
                <Link href={`/parcels/${p.parcelId}`} className="tap-target">
                  {p.displayId ?? 'Parcel'}
                </Link>
                {`, ${p.eventKind.replaceAll('_', ' ')} effective ${formatCivilDate(p.effectiveDate)}`}
              </li>
            ))}
            {view.lineage.children.map((c) => (
              <li key={`c${c.eventId}${c.parcelId}`}>
                {'Child lot '}
                <Link href={`/parcels/${c.parcelId}`} className="tap-target">
                  {c.displayId ?? 'Parcel'}
                </Link>
                {`, ${c.eventKind.replaceAll('_', ' ')} effective ${formatCivilDate(c.effectiveDate)}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.hasGeometry ? (
        <LinkedParcelMap
          hrefBase="/parcels/"
          selectedParcelId={view.parcelId}
          {...(bbox == null ? {} : { bbox })}
          layers={overlays}
          basemapRasterUrl={basemap?.rasterUrl ?? null}
          basemapAttribution={basemap?.attribution ?? null}
        />
      ) : null}
      <div className="mt-6">
        <RecordsSection history={view.history} />
      </div>
    </main>
  )
}
