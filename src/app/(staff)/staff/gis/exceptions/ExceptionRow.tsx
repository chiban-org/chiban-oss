import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import type { importExceptions } from '@/db/schema'
import { exceptionKindLabel } from '@/features/gis/exceptionLabels'
import { exceptionParcelId } from '@/features/gis/exceptionView'
import { exceptionDetailText, exceptionSubject } from '@/features/gis/import/runText'
import { acceptHeldRowAction, dismissExceptionAction } from './actions'
import { ExceptionFacts } from './ExceptionFacts'

type ExceptionRecord = typeof importExceptions.$inferSelect

function RowTitle({ row }: { row: ExceptionRecord }) {
  const parcelId = exceptionParcelId(row.payload)
  const subject = exceptionSubject(row.rowKey)
  return (
    <h3 className="m-0">
      {`${exceptionKindLabel(row.kind)}: `}
      {parcelId === null ? subject : <Link href={`/staff/parcels/${parcelId}`}>{subject}</Link>}
    </h3>
  )
}

function RowActions({ row }: { row: ExceptionRecord }) {
  return (
    <div className="flex flex-wrap items-start gap-4 border-t pt-4">
      {row.kind === 'owner_changed' ? (
        <ActionForm action={acceptHeldRowAction} submitLabel="Apply the change" compact>
          <input type="hidden" name="exceptionId" value={row.id} />
        </ActionForm>
      ) : null}
      <details className="min-w-0 flex-1 basis-64">
        <summary>Dismiss</summary>
        <ActionForm
          action={dismissExceptionAction}
          submitLabel="Dismiss"
          confirm={{
            title: 'Dismiss this exception?',
            body: 'It leaves the exceptions list with your reason, and the stored parcel data stays as it is.',
            confirmLabel: 'Dismiss',
          }}
          className="max-w-md"
        >
          <input type="hidden" name="exceptionId" value={row.id} />
          <TextField
            label="Reason"
            name="reason"
            hint="Recorded with the exception, for example why the stored value is right."
            required
          />
        </ActionForm>
      </details>
    </div>
  )
}

export function ExceptionRow({
  row,
  timeZone,
  canManage,
}: {
  row: ExceptionRecord
  timeZone: string
  canManage: boolean
}) {
  return (
    <li className="exception-card flex flex-col gap-4 rounded-[var(--radius)] border border-hairline bg-surface p-5">
      <div>
        <RowTitle row={row} />
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          {exceptionDetailText(row.detail, row.createdAt, timeZone)}
        </p>
      </div>
      <ExceptionFacts payload={row.payload} />
      {row.dispositionReason === null ? null : (
        <p className="m-0 text-sm">{`Reason: ${row.dispositionReason}`}</p>
      )}
      {canManage && row.status === 'open' ? <RowActions row={row} /> : null}
    </li>
  )
}
