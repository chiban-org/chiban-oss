import Link from 'next/link'
import type { ReactNode } from 'react'
import { StatusChip } from '@/components/StatusChip'
import type { AncestralRecord, OwnRecord, ParcelHistory } from '@/features/parcels/parcelHistory'

interface RecordsSectionProps {
  history: ParcelHistory
  renderAction?: (record: AncestralRecord) => ReactNode
}

function RecordRow({
  record,
  children,
}: {
  record: OwnRecord | AncestralRecord
  children?: ReactNode
}) {
  const carried = 'carriedFrom' in record ? record.carriedFrom : undefined
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
      <div>
        <Link href={record.href} className="font-semibold text-action underline">
          {record.title}
        </Link>
        {record.number === null ? null : (
          <span className="ml-2 text-muted-foreground">{record.number}</span>
        )}
        {carried === undefined ? null : (
          <p className="text-sm text-muted-foreground">{`Carried forward from parcel ${carried.displayId}`}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <StatusChip status={record.status.chip} label={record.status.label} />
        {children}
      </div>
    </li>
  )
}

export function RecordsSection({ history, renderAction }: RecordsSectionProps) {
  const empty = history.own.length === 0 && history.ancestral.length === 0
  return (
    <section aria-labelledby="records-heading">
      <h2 id="records-heading">Records</h2>
      {empty ? <p>No records for this parcel are in Chiban yet.</p> : null}
      {history.own.length === 0 ? null : (
        <ul>
          {history.own.map((r) => (
            <RecordRow key={`${r.kind}:${r.recordId}`} record={r} />
          ))}
        </ul>
      )}
      {history.ancestral.map((group) => (
        <div key={group.parcelId} className="mt-4">
          <h3 className="text-base font-semibold">{group.label}</h3>
          <ul>
            {group.records.map((r) => (
              <RecordRow key={`${r.kind}:${r.recordId}`} record={r}>
                {renderAction?.(r)}
              </RecordRow>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
