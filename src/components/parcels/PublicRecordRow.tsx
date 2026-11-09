import Link from 'next/link'
import { NEW_TAB } from '@/components/newTab'
import { StatusChip } from '@/components/StatusChip'
import type { RecordFile, RecordRow } from '@/features/parcels/recordTable'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

function filesText(count: number): string {
  return count === 1 ? '1 file' : `${count} files`
}

export function PublicFileList({
  files,
  nested = true,
}: {
  files: readonly RecordFile[]
  nested?: boolean
}) {
  return (
    <ul
      className={
        nested ? 'm-0 mt-2 list-none border-l-2 border-hairline p-0 pl-4' : 'm-0 list-none p-0'
      }
    >
      {files.map((file) => (
        <li key={file.id} className="py-1">
          {file.href === null ? (
            <span>{file.title}</span>
          ) : (
            <a {...NEW_TAB} href={file.href} className="break-words">
              {file.title}
            </a>
          )}
          <span className="text-muted-foreground">
            {[file.kindLabel, file.added === null ? null : `added ${formatCivilDate(file.added)}`]
              .filter((part): part is string => part !== null)
              .map((part) => `, ${part}`)
              .join('')}
          </span>
        </li>
      ))}
    </ul>
  )
}

function dateLines(row: RecordRow): string[] {
  const line = (label: string, date: CivilDate | null) =>
    date === null ? [] : [`${label} ${formatCivilDate(date)}`]
  const scheduled = row.dates.closed === null ? line('Scheduled', row.scheduled) : []
  return [
    ...line(row.kind === 'enforcement_case' ? 'Opened' : 'Filed', row.dates.filed),
    ...line(row.kind === 'application' ? 'Decided' : 'Closed', row.dates.closed),
    ...line('Issued', row.dates.issued),
    ...scheduled,
  ]
}

function RecordFiles({ row }: { row: RecordRow }) {
  if (row.files.length === 0) return null
  if (!row.closed) return <PublicFileList files={row.files} />
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-action">{filesText(row.files.length)}</summary>
      <PublicFileList files={row.files} />
    </details>
  )
}

function StandaloneDocumentRow({ row }: { row: RecordRow }) {
  return (
    <li id={`record-${row.recordId}`} className="record-item pb-3">
      <PublicFileList
        nested={false}
        files={[
          {
            id: row.recordId,
            title: row.number ?? row.title,
            kindLabel: row.number === null ? null : row.title,
            href: row.href,
            visibility: row.status,
            added: row.dates.filed,
          },
        ]}
      />
    </li>
  )
}

export function PublicRecordRow({ row }: { row: RecordRow }) {
  if (row.kind === 'document') return <StandaloneDocumentRow row={row} />
  const dates = dateLines(row)
  return (
    <li id={`record-${row.recordId}`} className="record-item flex flex-col gap-1 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="m-0 flex flex-wrap items-baseline gap-x-3">
          <span className="font-semibold">{row.title}</span>
          {row.number === null ? null : (
            <span className="whitespace-nowrap text-ink-secondary">{row.number}</span>
          )}
        </p>
        <StatusChip status={row.status.chip} label={row.status.label} />
      </div>
      {dates.length === 0 ? null : <p className="m-0 text-ink-secondary">{dates.join(' · ')}</p>}
      {row.note === null ? null : <p className="m-0 text-muted-foreground">{row.note}</p>}
      {row.carriedFrom === undefined ? null : (
        <p className="m-0 text-muted-foreground">
          {'Carried forward from parcel '}
          <Link href={`/parcels/${row.carriedFrom.parcelId}`}>{row.carriedFrom.displayId}</Link>
        </p>
      )}
      <RecordFiles row={row} />
    </li>
  )
}
