import Link from 'next/link'
import { lineageEventText } from '@/features/parcels/parcelText'
import type { StaffParcelView } from '@/features/parcels/staffParcelView'
import { NO_MAP_LOT_ID } from './parcelPageData'

export function lineageOf(view: StaffParcelView) {
  return [
    ...view.lineage.parents.map((p) => ({ ...p, rel: 'Parent' })),
    ...view.lineage.children.map((c) => ({ ...c, rel: 'Child' })),
  ]
}

export function LineagePanel({ lineage }: { lineage: ReturnType<typeof lineageOf> }) {
  return (
    <section id="lineage" aria-label="Lineage">
      <h2>Lineage</h2>
      {lineage.length === 0 ? (
        <p>No lineage events for this parcel.</p>
      ) : (
        <ul>
          {lineage.map((l) => (
            <li key={`${l.eventId}:${l.parcelId}`}>
              {`${l.rel} lot `}
              <Link href={`/staff/parcels/${l.parcelId}`}>{l.displayId ?? NO_MAP_LOT_ID}</Link>
              {`, ${lineageEventText(l.eventKind, l.effectiveDate)}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
