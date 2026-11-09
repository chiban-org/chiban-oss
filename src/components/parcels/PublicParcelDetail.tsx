import { type Fact, PageHeader } from '@/components/layout/PageHeader'
import { LinkedParcelMap } from '@/components/map/LinkedParcelMap'
import { FoldedMap } from '@/components/parcels/FoldedMap'
import { HonestText } from '@/components/parcels/HonestText'
import { ParcelLineage } from '@/components/parcels/ParcelLineage'
import { RecordsSection } from '@/components/parcels/RecordsSection'
import { StatusChip } from '@/components/StatusChip'
import type { Bbox } from '@/features/gis/extent'
import { honestText } from '@/features/honest/honest'
import type { PublicParcelView } from '@/features/parcels/publicParcelView'
import { buildRecordTable, parcelFilesOf } from '@/features/parcels/recordTable'
import type { TownOffice } from '@/features/town/publicTown'
import { formatCivilDate, formatInstantDate } from '@/lib/formatDate'

interface PublicParcelDetailProps {
  view: PublicParcelView
  timeZone: string
  overlays: ('roads' | 'water')[]
  basemap: { rasterUrl: string | null; attribution: string | null } | null
  office: TownOffice
  bbox?: Bbox | null
}

function bannerText(view: PublicParcelView, timeZone: string): string | null {
  const { layer } = view
  const last =
    layer.lastSuccessAt === null ? null : formatInstantDate(new Date(layer.lastSuccessAt), timeZone)
  if (layer.state === 'stale' && last !== null)
    return `Parcel data last imported ${last}. It may be out of date.`
  if (layer.state === 'import_failed') {
    return `The latest update of parcel data failed. ${last === null ? 'No earlier import is on file.' : `Information shown was last imported ${last} and may be out of date.`}`
  }
  if (layer.state === 'never_imported') return 'Parcel data has not been loaded yet.'
  return null
}

function Banner({ view, timeZone }: { view: PublicParcelView; timeZone: string }) {
  const text = bannerText(view, timeZone)
  if (text === null) return null
  return (
    <p role="status" className="max-w-[75ch]">
      <span className="bg-highlight px-1">{text}</span>
    </p>
  )
}

export function parcelTitle(view: PublicParcelView): { title: string; mapLot: string | null } {
  const mapLot = (view.ids.find((i) => !i.retired) ?? view.ids[0])?.value ?? null
  const address = honestText(view.siteAddress, '')
  return { title: address === '' ? (mapLot ?? 'Parcel') : address, mapLot }
}

function facts(view: PublicParcelView, timeZone: string, mapLot: string | null): Fact[] {
  const others = view.ids.filter((id) => id.value !== mapLot)
  return [
    ...(mapLot === null ? [] : [{ label: 'Map-lot ID', value: mapLot }]),
    { label: 'Owner of record', value: <HonestText value={view.owner} timeZone={timeZone} /> },
    {
      label: 'Area',
      value: <HonestText value={view.areaAcres} format={(n) => `${n} acres`} timeZone={timeZone} />,
    },
    ...(others.length === 0
      ? []
      : [
          {
            label: 'Other parcel IDs',
            value: others
              .map((id) => (id.retired ? `${id.value} (retired ID)` : `${id.value} (${id.label})`))
              .join(', '),
          },
        ]),
  ]
}

export function PublicParcelDetail(props: PublicParcelDetailProps) {
  const { view, timeZone, overlays, basemap, bbox, office } = props
  const { title, mapLot } = parcelTitle(view)
  const hasAddress = honestText(view.siteAddress, '') !== ''
  return (
    <main className="text-base">
      <PageHeader
        kicker="Parcel"
        title={title}
        status={
          view.status === 'retired' ? (
            <StatusChip
              status="neutral"
              label={
                view.retiredOn === null ? 'Retired' : `Retired ${formatCivilDate(view.retiredOn)}`
              }
            />
          ) : undefined
        }
        lead={hasAddress ? undefined : 'No site address on file'}
        facts={facts(view, timeZone, mapLot)}
      />
      <Banner view={view} timeZone={timeZone} />
      <RecordsSection
        table={buildRecordTable(view.history, view.parcelId)}
        parcelFiles={parcelFilesOf(view.history, view.parcelId)}
        office={office}
      />
      <ParcelLineage lineage={view.lineage} />
      {view.hasGeometry ? (
        <section aria-labelledby="map-heading">
          <h2 id="map-heading">Map</h2>
          <FoldedMap summary="Show this parcel on the map">
            <LinkedParcelMap
              hrefBase="/parcels/"
              selectedParcelId={view.parcelId}
              {...(bbox == null ? {} : { bbox })}
              layers={overlays}
              basemapRasterUrl={basemap?.rasterUrl ?? null}
              basemapAttribution={basemap?.attribution ?? null}
            />
          </FoldedMap>
        </section>
      ) : null}
    </main>
  )
}
