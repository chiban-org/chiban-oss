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

function RecordDetails({
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
    <div className="flex items-start gap-4">
      {record.thumbnailHref === undefined || record.thumbnailHref === null ? null : (
        <img
          src={record.thumbnailHref}
          alt={`First page of ${record.title}`}
          width={48}
          loading="lazy"
          className="h-16 w-12 shrink-0 overflow-hidden border object-cover object-top text-[0px]"
        />
      )}
      <div className="min-w-0 flex-1">
        <RecordTitle record={record} />
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
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
        <StatusChip status={record.status.chip} label={record.status.label} />
        {children}
      </div>
    </div>
  )
}

function RecordTitle({ record }: { record: OwnRecord | AncestralRecord }) {
  return (
    <>
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
    </>
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
  if (record.closed !== true) {
    return (
      <li className="border-b py-3 last:border-b-0">
        <RecordDetails record={record} hrefBase={hrefBase}>
          {children}
        </RecordDetails>
      </li>
    )
  }
  return (
    <li className="border-b py-2 last:border-b-0">
      <details>
        <summary className="flex cursor-pointer items-center gap-3">
          <span className="min-w-0 flex-1">
            <RecordTitle record={record} />
          </span>
          <StatusChip status={record.status.chip} label={record.status.label} />
        </summary>
        <div className="pt-2">
          <RecordDetails record={record} hrefBase={hrefBase}>
            {children}
          </RecordDetails>
        </div>
      </details>
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
