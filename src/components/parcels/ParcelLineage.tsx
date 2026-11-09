import Link from 'next/link'
import type { LineageRef } from '@/features/parcels/lineage'
import { LINEAGE_KIND_WORDS } from '@/features/parcels/parcelHistory'
import { formatCivilDate } from '@/lib/formatDate'

function kindLabel(kind: LineageRef['eventKind']): string {
  const words = LINEAGE_KIND_WORDS[kind] ?? kind
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

function LineageList({ id, title, refs }: { id: string; title: string; refs: LineageRef[] }) {
  if (refs.length === 0) return null
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ul className="m-0 list-none p-0">
        {refs.map((ref) => (
          <li key={`${ref.eventId}${ref.parcelId}`} className="record-item pb-2">
            {`${kindLabel(ref.eventKind)} effective ${formatCivilDate(ref.effectiveDate)}: `}
            <Link href={`/parcels/${ref.parcelId}`} className="tap-target inline-flex items-center">
              {ref.displayId ?? 'Parcel'}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ParcelLineage({
  lineage,
}: {
  lineage: { parents: LineageRef[]; children: LineageRef[] }
}) {
  return (
    <>
      <LineageList
        id="lineage-parents"
        title="Where this parcel came from"
        refs={lineage.parents}
      />
      <LineageList id="lineage-children" title="What this parcel became" refs={lineage.children} />
    </>
  )
}
