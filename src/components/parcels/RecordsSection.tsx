import { SectionHeader } from '@/components/layout/ListHeader'
import { GroupLabel } from '@/components/parcels/GroupLabel'
import { PublicFileList, PublicRecordRow } from '@/components/parcels/PublicRecordRow'
import type { PublicRecords } from '@/features/parcels/publicRecords'
import type { RecordRow } from '@/features/parcels/recordTable'
import type { TownOffice } from '@/features/town/publicTown'

interface RecordsSectionProps {
  records: PublicRecords
  office: TownOffice
}

function openFirstNewestFirst(a: RecordRow, b: RecordRow): number {
  if (a.closed !== b.closed) return a.closed ? 1 : -1
  return (b.activity ?? '').localeCompare(a.activity ?? '') || a.key.localeCompare(b.key)
}

function RecordList({ rows }: { rows: readonly RecordRow[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {[...rows].sort(openFirstNewestFirst).map((row) => (
        <PublicRecordRow key={row.key} row={row} />
      ))}
    </ul>
  )
}

function emptyText(office: TownOffice): string {
  const where = `Older paper files may be at the ${office.officeName}`
  return `No records on file for this parcel. ${where}${office.phone === '' ? '' : `, ${office.phone}`}.`
}

export function RecordsSection({ records, office }: RecordsSectionProps) {
  const empty =
    records.own.length === 0 && records.ancestral.length === 0 && records.files.length === 0
  return (
    <section aria-labelledby="records-heading">
      <SectionHeader
        id="records-heading"
        title="Records"
        lead={
          empty ? undefined : <p className="m-0 text-muted-foreground">Files open in a new tab.</p>
        }
      />
      {empty ? <p>{emptyText(office)}</p> : null}
      {records.own.length === 0 ? null : <RecordList rows={records.own} />}
      {records.ancestral.map((group) => (
        <div key={group.parcelId} className="mt-6">
          <h3 className="text-base font-semibold">
            <GroupLabel group={group} hrefBase="/parcels/" />
          </h3>
          {group.rows.length === 0 ? null : <RecordList rows={group.rows} />}
          {group.files.length === 0 ? null : <PublicFileList files={group.files} />}
        </div>
      ))}
      {records.files.length === 0 ? null : (
        <div className="mt-6">
          <h3 className="text-base font-semibold">Files on this parcel</h3>
          <PublicFileList files={records.files} />
        </div>
      )}
    </section>
  )
}
