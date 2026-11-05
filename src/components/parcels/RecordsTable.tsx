import Link from 'next/link'
import type { ReactNode } from 'react'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { ExpandableRecordRow } from '@/components/parcels/ExpandableRecordRow'
import { RecordFiles } from '@/components/parcels/RecordFiles'
import { STACKED } from '@/components/parcels/stackedCell'
import { StatusChip } from '@/components/StatusChip'
import type { SortLink } from '@/features/dataTable/sort'
import type { RecordRow } from '@/features/parcels/recordTable'
import type { RecordSortKey } from '@/features/parcels/recordTableView'
import { formatCivilDateShort } from '@/lib/formatDate'
import { cn } from '@/lib/utils'
import type { CivilDate } from '@/types/civilDate'

type Links = Record<RecordSortKey, SortLink>

interface DateColumn {
  label: string
  date: (row: RecordRow) => CivilDate | null
  link: (links: Links) => SortLink
}

const DATE_COLUMNS: readonly DateColumn[] = [
  { label: 'Filed or opened', date: (r) => r.dates.filed, link: (l) => l.filed },
  { label: 'Issued', date: (r) => r.dates.issued, link: (l) => l.issued },
  { label: 'Expires', date: (r) => r.dates.expires, link: (l) => l.expires },
  { label: 'Decided or closed', date: (r) => r.dates.closed, link: (l) => l.closed },
]

const NONE = <span className="text-muted-foreground">None</span>

function DateCell({ label, date }: { label: string; date: CivilDate | null }) {
  return (
    <td
      data-label={label}
      className={cn(STACKED, 'whitespace-nowrap tabular-nums', date === null && 'max-md:hidden')}
    >
      {date === null ? NONE : formatCivilDateShort(date)}
    </td>
  )
}

function Identifier({ row }: { row: RecordRow }) {
  const label = row.number ?? row.title
  if (row.href === null) return <span className="whitespace-nowrap font-semibold">{label}</span>
  return (
    <Link href={row.href} className="whitespace-nowrap font-semibold">
      {label}
    </Link>
  )
}

function RecordCell({ row, parcelHrefBase }: { row: RecordRow; parcelHrefBase: string }) {
  return (
    <td data-label="Record" className="max-md:block max-md:p-0">
      <Identifier row={row} />
      {row.number === null ? null : <span className="block">{row.title}</span>}
      {row.carriedFrom === undefined ? null : (
        <span className="block text-xs text-muted-foreground">
          {'Carried forward from parcel '}
          <Link href={`${parcelHrefBase}${row.carriedFrom.parcelId}`}>
            {row.carriedFrom.displayId}
          </Link>
        </span>
      )}
      {row.note === null ? null : (
        <span className="line-clamp-2 max-w-56 text-xs text-muted-foreground" title={row.note}>
          {row.note}
        </span>
      )}
    </td>
  )
}

function Cells({ row, parcelHrefBase }: { row: RecordRow; parcelHrefBase: string }) {
  return (
    <>
      <RecordCell row={row} parcelHrefBase={parcelHrefBase} />
      <td data-label="Status" className={STACKED}>
        <span>
          <StatusChip status={row.status.chip} label={row.status.label} />
        </span>
      </td>
      {DATE_COLUMNS.map((column) => (
        <DateCell key={column.label} label={column.label} date={column.date(row)} />
      ))}
    </>
  )
}

export function RecordsTable({
  caption,
  rows,
  links,
  parcelHrefBase,
  renderAction,
}: {
  caption: string
  rows: RecordRow[]
  links: Links
  parcelHrefBase: string
  renderAction?: ((row: RecordRow) => ReactNode) | undefined
}) {
  const colSpan = DATE_COLUMNS.length + 3 + (renderAction === undefined ? 0 : 1)
  return (
    <div className="overflow-x-auto max-md:overflow-visible">
      <table className="w-full text-sm max-md:block">
        <caption className="sr-only">{caption}</caption>
        <thead className="max-md:hidden">
          <tr>
            <SortHeader label="Record" link={links.number} />
            <SortHeader label="Status" link={links.status} />
            {DATE_COLUMNS.map((column) => (
              <SortHeader key={column.label} label={column.label} link={column.link(links)} />
            ))}
            <th scope="col">Files</th>
            {renderAction === undefined ? null : (
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="max-md:block">
          {rows.map((row) => (
            <ExpandableRecordRow
              key={row.key}
              closed={row.closed}
              fileCount={row.files.length}
              colSpan={colSpan}
              cells={<Cells row={row} parcelHrefBase={parcelHrefBase} />}
              trailing={
                renderAction === undefined ? undefined : (
                  <td className="max-md:block max-md:p-0">{renderAction(row)}</td>
                )
              }
              detail={<RecordFiles record={row} />}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
