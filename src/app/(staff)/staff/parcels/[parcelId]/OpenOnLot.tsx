import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import type { OpenItem } from '@/features/parcels/openNow'
import { NextInspectionLead } from './LotInspection'
import type { ParcelPageData } from './parcelPageData'

function OpenRow({ item }: { item: OpenItem }) {
  return (
    <li className="record-item flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {item.href === null ? (
          <span className="font-semibold">{item.label}</span>
        ) : (
          <Link href={item.href} className="font-semibold">
            {item.label}
          </Link>
        )}
        {item.sublabel === null ? null : (
          <span className="block text-sm text-muted-foreground">{item.sublabel}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {item.next === null ? null : <span className="text-sm tabular-nums">{item.next}</span>}
        <StatusChip status={item.status.chip} label={item.status.label} />
      </div>
    </li>
  )
}

export function OpenList({ items, label }: { items: readonly OpenItem[]; label: string }) {
  return (
    <ul aria-label={label} className="list-none p-0">
      {items.map((item) => (
        <OpenRow key={item.key} item={item} />
      ))}
    </ul>
  )
}

export function OpenOnLot({ data }: { data: ParcelPageData }) {
  const items = data.items.filter((i) => i.recordId !== data.next?.id)
  return (
    <section id="open" aria-labelledby="open-heading">
      <h2 id="open-heading">Open on this lot</h2>
      <NextInspectionLead data={data} />
      {items.length === 0 && data.next === null ? <p>Nothing is open on this lot.</p> : null}
      {items.length === 0 ? null : <OpenList items={items} label="Open records on this lot" />}
    </section>
  )
}

export function openPanelIsEmpty(data: ParcelPageData): boolean {
  return data.items.length === 0 && data.next === null
}
