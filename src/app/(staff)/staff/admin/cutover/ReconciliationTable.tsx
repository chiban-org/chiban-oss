import { ActionForm } from '@/components/ActionForm'
import { RECENT_RECONCILIATIONS, type ReconciliationSummary } from '@/features/cutover/reconcile'
import { formatInstantLong } from '@/lib/formatDate'
import { signOffReconciliationAction } from './actions'

function SignOffCell({
  row,
  isAdmin,
  timeZone,
}: {
  row: ReconciliationSummary
  isAdmin: boolean
  timeZone: string
}) {
  if (row.signedOffAt !== null) {
    return <>{`Signed off ${formatInstantLong(row.signedOffAt, timeZone)}`}</>
  }
  if (!isAdmin) return <>Waiting for an administrator</>
  return (
    <ActionForm action={signOffReconciliationAction} submitLabel="Sign off" compact={true}>
      <input type="hidden" name="reconciliationId" value={row.id} />
    </ActionForm>
  )
}

export function ReconciliationTable({
  rows,
  isAdmin,
  timeZone,
}: {
  rows: readonly ReconciliationSummary[]
  isAdmin: boolean
  timeZone: string
}) {
  if (rows.length === 0) return <p>No comparisons yet.</p>
  return (
    <>
      <p className="text-muted-foreground">{`Newest first, up to ${RECENT_RECONCILIATIONS} comparisons.`}</p>
      <div className="table-panel my-3">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr>
              <th scope="col">Compared</th>
              <th scope="col">Matched</th>
              <th scope="col">On the list, not imported</th>
              <th scope="col">Imported, not on the list</th>
              <th scope="col">Sign-off</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td>{formatInstantLong(row.createdAt, timeZone)}</td>
                <td className="tabular-nums">{row.matched}</td>
                <td className="tabular-nums">{row.missing}</td>
                <td className="tabular-nums">{row.extra}</td>
                <td>
                  <SignOffCell row={row} isAdmin={isAdmin} timeZone={timeZone} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
