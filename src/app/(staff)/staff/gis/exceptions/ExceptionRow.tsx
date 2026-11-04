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
    <p className="font-semibold">
      {`${exceptionKindLabel(row.kind)}: `}
      {parcelId === null ? subject : <Link href={`/staff/parcels/${parcelId}`}>{subject}</Link>}
    </p>
  )
}

function RowActions({ row }: { row: ExceptionRecord }) {
  return (
    <div className="mt-2 flex flex-wrap gap-6">
      {row.kind === 'owner_changed' ? (
        <ActionForm action={acceptHeldRowAction} submitLabel="Apply held row">
          <input type="hidden" name="exceptionId" value={row.id} />
        </ActionForm>
      ) : null}
      <ActionForm action={dismissExceptionAction} submitLabel="Dismiss">
        <input type="hidden" name="exceptionId" value={row.id} />
        <TextField label="Reason" name="reason" required />
      </ActionForm>
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
    <li className="py-4">
      <RowTitle row={row} />
      <p className="text-sm text-muted-foreground">
        {exceptionDetailText(row.detail, row.createdAt, timeZone)}
      </p>
      <ExceptionFacts payload={row.payload} />
      {row.dispositionReason === null ? null : (
        <p className="text-sm">{`Reason: ${row.dispositionReason}`}</p>
      )}
      {canManage && row.status === 'open' ? <RowActions row={row} /> : null}
    </li>
  )
}
