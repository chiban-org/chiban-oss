import Link from 'next/link'
import { type Fact, FactList } from '@/components/layout/PageHeader'
import { HonestText } from '@/components/parcels/HonestText'
import { BalanceDueNotice } from '@/components/staff/BalanceDueNotice'
import { EXCEPTIONS_PATH } from '@/features/gis/exceptionSort'
import type { HonestValue } from '@/features/honest/honest'
import type { ParcelPageData } from './parcelPageData'

function LayerBanner({ data }: { data: ParcelPageData }) {
  if (data.view.layer.state === 'fresh') return null
  return (
    <p role="status" className="my-3 rounded-md bg-highlight px-3 py-2 text-sm">
      {data.layerText}
    </p>
  )
}

export function ownerSearchHref(owner: string): string {
  return `/staff/parcels?q=${encodeURIComponent(owner)}`
}

function Owner({ owner, timeZone }: { owner: HonestValue<string>; timeZone: string }) {
  return (
    <HonestText
      value={owner}
      timeZone={timeZone}
      format={(name) => <Link href={ownerSearchHref(name)}>{name}</Link>}
    />
  )
}

function OpenExceptions({ data }: { data: ParcelPageData }) {
  const count = data.view.openExceptions
  if (count === 0) return 'None'
  if (!data.can.fullRecords) return `${count} open`
  return <Link href={`${EXCEPTIONS_PATH}?parcel=${data.parcelId}`}>{`${count} open`}</Link>
}

function NoticeTo({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </>
  )
}

export function parcelFacts(data: ParcelPageData): Fact[] {
  const { view, timeZone } = data
  return [
    { label: 'Owner', value: <Owner owner={view.owner} timeZone={timeZone} /> },
    {
      label: 'Mailing address',
      value: <HonestText value={view.mailingAddress} timeZone={timeZone} />,
    },
    {
      label: 'Area',
      value: <HonestText value={view.areaAcres} format={(n) => `${n} acres`} timeZone={timeZone} />,
    },
    { label: 'Notices go to', value: <NoticeTo lines={data.noticeTo} /> },
    { label: 'Open exceptions', value: <OpenExceptions data={data} /> },
  ]
}

function MoreActionLinks({ data }: { data: ParcelPageData }) {
  if (!data.can.manageParcel) return null
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      <li>
        <Link href={`/staff/parcels/lineage/new?parent=${encodeURIComponent(data.displayId)}`}>
          Record lineage event
        </Link>
      </li>
    </ul>
  )
}

function Notices({ data }: { data: ParcelPageData }) {
  return (
    <div className="rail-card empty:hidden">
      <BalanceDueNotice notices={data.notices} linkApplications />
      <LayerBanner data={data} />
    </div>
  )
}

export function ParcelRail({ data }: { data: ParcelPageData }) {
  return (
    <>
      <Notices data={data} />
      <div className="rail-card">
        <FactList stacked facts={parcelFacts(data)} />
      </div>
      {data.can.manageParcel ? (
        <details data-slot="more-actions" className="rail-card">
          <summary>More actions</summary>
          <MoreActionLinks data={data} />
        </details>
      ) : null}
    </>
  )
}

export function ParcelStrip({ data }: { data: ParcelPageData }) {
  return (
    <section aria-label="Status" data-plain className="rail-card flex flex-col gap-3 [&>*]:m-0">
      <p data-slot="open-now-strip">{data.sentence}</p>
      <BalanceDueNotice notices={data.notices} linkApplications />
      <LayerBanner data={data} />
      <details>
        <summary className="text-sm">Facts and more actions</summary>
        <div className="flex flex-col gap-4">
          <FactList stacked facts={parcelFacts(data)} />
          <MoreActionLinks data={data} />
        </div>
      </details>
    </section>
  )
}
