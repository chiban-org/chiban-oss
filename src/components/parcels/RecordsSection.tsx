import { GroupLabel } from '@/components/parcels/GroupLabel'
import { PublicFileList, PublicRecordRow } from '@/components/parcels/PublicRecordRow'
import type { RecordFile, RecordRow, RecordTable } from '@/features/parcels/recordTable'
import type { TownOffice } from '@/features/town/publicTown'

interface RecordsSectionProps {
  table: RecordTable
  parcelFiles: readonly RecordFile[]
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

export function RecordsSection({ table, parcelFiles, office }: RecordsSectionProps) {
  const empty = table.own.length === 0 && table.ancestral.length === 0 && parcelFiles.length === 0
  return (
    <section aria-labelledby="records-heading">
      <h2 id="records-heading">Records</h2>
      {empty ? (
        <p>{emptyText(office)}</p>
      ) : (
        <p className="text-muted-foreground">Files open in a new tab.</p>
      )}
      {table.own.length === 0 ? null : <RecordList rows={table.own} />}
      {table.ancestral.map((group) => (
        <div key={group.parcelId} className="mt-6">
          <h3 className="text-base font-semibold">
            <GroupLabel group={group} hrefBase="/parcels/" />
          </h3>
          <RecordList rows={group.rows} />
        </div>
      ))}
      {parcelFiles.length === 0 ? null : (
        <div className="mt-6">
          <h3 className="text-base font-semibold">Files on this parcel</h3>
          <PublicFileList files={parcelFiles} />
        </div>
      )}
    </section>
  )
}
