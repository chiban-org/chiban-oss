import Link from 'next/link'
import type { ReactNode } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { FormDialog } from '@/components/FormDialog'
import { StatusChip } from '@/components/StatusChip'
import type { EntryKind } from '@/features/rosters/confirm'
import type { EntryMeta } from '@/features/rosters/contactRows'
import { confirmEntryAction } from './confirmActions'

export function ParcelLink({ parcelId, label }: { parcelId: string; label: string }) {
  return (
    <Link
      href={`/staff/parcels/${parcelId}`}
      className="whitespace-nowrap font-semibold tabular-nums"
    >
      {label}
    </Link>
  )
}

export function ActionsHeader() {
  return (
    <th scope="col">
      <span className="sr-only">Actions</span>
    </th>
  )
}

export function Checked({ row }: { row: EntryMeta }) {
  return (
    <div className="space-y-1">
      <p className="whitespace-nowrap">{row.checkedText}</p>
      {row.due ? <StatusChip status="overdue" label="Due for a check" /> : null}
    </div>
  )
}

export function UsedBy({ row }: { row: EntryMeta }) {
  if (row.uses.length === 0) return <span className="text-muted-foreground">Not on a list</span>
  const count = row.uses.length
  return (
    <details>
      <summary className="whitespace-nowrap">{`Used on ${count} ${count === 1 ? 'list' : 'lists'}`}</summary>
      <ul className="m-0 mt-1 list-none space-y-1 p-0">
        {row.uses.map((use) => (
          <li key={use.listId}>
            <Link href={`/staff/applications/${use.applicationId}`}>{use.applicationNumber}</Link>
            {', '}
            <Link href={`/staff/abutters/${use.listId}`}>
              {use.status === 'issued' ? 'issued list' : 'draft list'}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}

export function PersonLines({
  people,
}: {
  people: { key: string; name: string; middle: string; mailingAddress: string }[]
}) {
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {people.map((p) => (
        <li key={p.key}>
          <span className="font-medium">{p.name}</span>
          {p.middle === '' ? null : `, ${p.middle}`}
          <br />
          {p.mailingAddress}
        </li>
      ))}
    </ul>
  )
}

function EarlierVersions({ row, record }: { row: EntryMeta; record: string }) {
  if (row.versions.length === 0) return null
  return (
    <FormDialog
      label="Earlier versions"
      accessibleLabel={`Earlier versions of ${record}`}
      title={`Earlier versions of ${record}`}
      description="What was on file before each change, newest first."
      size="sm"
    >
      <ol className="m-0 list-none space-y-4 p-0">
        {row.versions.map((v, index) => (
          <li key={`${v.changedText}-${index}`} className="record-item">
            <p className="m-0 font-semibold">{v.changedText}</p>
            {v.lines.map((line) => (
              <p key={line} className="m-0">
                {line}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </FormDialog>
  )
}

export function RowActions({
  row,
  kind,
  record,
  edit,
  extra,
}: {
  row: EntryMeta
  kind: EntryKind
  record: string
  edit: ReactNode
  extra?: ReactNode
}) {
  return (
    <div className="row-actions">
      {edit}
      <ActionForm
        action={confirmEntryAction}
        submitLabel="Confirm still correct"
        submitAccessibleLabel={`Confirm ${record} still correct`}
        compact
      >
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="entryId" value={row.entryId} />
      </ActionForm>
      {extra}
      <EarlierVersions row={row} record={record} />
    </div>
  )
}
