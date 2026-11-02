import Link from 'next/link'
import type { ReactNode } from 'react'
import { StatusChip } from '@/components/StatusChip'
import type {
  AncestralGroup,
  AncestralRecord,
  OwnRecord,
  ParcelHistory,
} from '@/features/parcels/parcelHistory'

interface RecordsSectionProps {
  history: ParcelHistory
  parcelHrefBase?: string
  renderAction?: (record: AncestralRecord) => ReactNode
}

function ParcelLink({ base, parcelId, label }: { base: string; parcelId: string; label: string }) {
  return (
    <Link href={`${base}${parcelId}`} className="tap-target text-action underline">
      {label}
    </Link>
  )
}

function RecordRow({
  record,
  hrefBase,
  children,
}: {
  record: OwnRecord | AncestralRecord
  hrefBase: string
  children?: ReactNode
}) {
  const carried = 'carriedFrom' in record ? record.carriedFrom : undefined
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
      {record.thumbnailHref === undefined || record.thumbnailHref === null ? null : (
        <img
          src={record.thumbnailHref}
          alt={`First page of ${record.title}`}
          width={96}
          loading="lazy"
          className="h-auto w-24 border"
        />
      )}
      <div>
        {record.href === null ? (
          <span className="font-semibold">{record.title}</span>
        ) : (
          <Link href={record.href} className="font-semibold text-action underline">
            {record.title}
          </Link>
        )}
        {record.number === null ? null : (
          <span className="ml-2 text-muted-foreground">{record.number}</span>
        )}
        {record.note === undefined || record.note === null ? null : (
          <p className="text-sm text-muted-foreground">{record.note}</p>
        )}
        {carried === undefined ? null : (
          <p className="text-sm text-muted-foreground">
            {'Carried forward from parcel '}
            <ParcelLink base={hrefBase} parcelId={carried.parcelId} label={carried.displayId} />
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <StatusChip status={record.status.chip} label={record.status.label} />
        {children}
      </div>
    </li>
  )
}

function GroupLabel({ group, hrefBase }: { group: AncestralGroup; hrefBase: string }) {
  const at = group.displayId === '' ? -1 : group.label.indexOf(group.displayId)
  if (at === -1) return group.label
  return (
    <>
      {group.label.slice(0, at)}
      <ParcelLink base={hrefBase} parcelId={group.parcelId} label={group.displayId} />
      {group.label.slice(at + group.displayId.length)}
    </>
  )
}

export function RecordsSection({
  history,
  renderAction,
  parcelHrefBase = '/parcels/',
}: RecordsSectionProps) {
  const empty = history.own.length === 0 && history.ancestral.length === 0
  return (
    <section aria-labelledby="records-heading">
      <h2 id="records-heading">Records</h2>
      {empty ? <p>No records for this parcel are in Chiban yet.</p> : null}
      {history.own.length === 0 ? null : (
        <ul>
          {history.own.map((r) => (
            <RecordRow key={`${r.kind}:${r.recordId}`} record={r} hrefBase={parcelHrefBase} />
          ))}
        </ul>
      )}
      {history.ancestral.map((group) => (
        <div key={group.parcelId} className="mt-4">
          <h3 className="text-base font-semibold">
            <GroupLabel group={group} hrefBase={parcelHrefBase} />
          </h3>
          <ul>
            {group.records.map((r) => (
              <RecordRow key={`${r.kind}:${r.recordId}`} record={r} hrefBase={parcelHrefBase}>
                {renderAction?.(r)}
              </RecordRow>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
