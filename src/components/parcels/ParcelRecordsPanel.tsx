import type { ReactNode } from 'react'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortBar } from '@/components/dataTable/SortHeader'
import { GroupLabel } from '@/components/parcels/GroupLabel'
import { RecordsTable } from '@/components/parcels/RecordsTable'
import type { RecordRow } from '@/features/parcels/recordTable'
import type { ArrangedRecords } from '@/features/parcels/recordTableView'

function sortOptions(links: ArrangedRecords['links']) {
  return [
    { label: 'Newest activity', link: links.activity },
    { label: 'Record', link: links.number },
    { label: 'Filed', link: links.filed },
    { label: 'Issued', link: links.issued },
    { label: 'Expires', link: links.expires },
    { label: 'Closed', link: links.closed },
  ]
}

export function ParcelRecordsPanel({
  records,
  parcelHrefBase,
  renderAction,
}: {
  records: ArrangedRecords
  parcelHrefBase: string
  renderAction?: (row: RecordRow) => ReactNode
}) {
  const nothingShown = records.own.length === 0 && records.ancestral.length === 0
  return (
    <section id="records" aria-labelledby="records-heading">
      <h2 id="records-heading">Records</h2>
      {records.total === 0 ? (
        <p>No records for this parcel are in Chiban yet.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Permits, cases and inspections on this parcel, newest activity first. Open a record’s
            files from its Files column.
          </p>
          <QuickFilters label="Record filters" groups={records.chips} clearHref={records.clear} />
          <SortBar className="md:hidden" options={sortOptions(records.links)} />
          {nothingShown ? <p>No record matches these filters.</p> : null}
          {records.own.length === 0 ? null : (
            <RecordsTable
              caption="Records on this parcel"
              rows={records.own}
              links={records.links}
              parcelHrefBase={parcelHrefBase}
            />
          )}
          {records.ancestral.map((group) => (
            <div key={group.parcelId}>
              <h3 className="text-base font-semibold">
                <GroupLabel group={group} hrefBase={parcelHrefBase} />
              </h3>
              <RecordsTable
                caption={`Records ${group.label}`}
                rows={group.rows}
                links={records.links}
                parcelHrefBase={parcelHrefBase}
                renderAction={renderAction}
              />
            </div>
          ))}
        </>
      )}
    </section>
  )
}
