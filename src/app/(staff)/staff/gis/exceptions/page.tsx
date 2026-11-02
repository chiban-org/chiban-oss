import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { Button } from '@/components/ui/button'
import { IMPORT_EXCEPTION_KINDS, type ImportExceptionKind } from '@/features/gis/exceptionKinds'
import { listExceptions } from '@/features/gis/exceptionsList'
import { exceptionDetailText, exceptionTitle } from '@/features/gis/import/runText'
import { townTimeZone } from '@/features/town/timeZone'
import { recordStaffContext } from '@/server/requireStaff'
import { acceptAllOwnerChangesAction, acceptHeldRowAction, dismissExceptionAction } from './actions'
import { ExceptionFacts } from './ExceptionFacts'

interface ExceptionsPageProps {
  searchParams: Promise<{ kind?: string; status?: string }>
}

const STATUSES = ['open', 'accepted', 'dismissed', 'resolved_by_rerun'] as const

function isKind(v: string | undefined): v is ImportExceptionKind {
  return IMPORT_EXCEPTION_KINDS.some((k) => k === v)
}

function isStatus(v: string | undefined): v is (typeof STATUSES)[number] {
  return STATUSES.some((s) => s === v)
}

export default async function StaffExceptionsPage({ searchParams }: ExceptionsPageProps) {
  const query = await searchParams
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Import exceptions" action="see import exceptions" />
  const status = isStatus(query.status) ? query.status : 'open'
  const rows = await listExceptions(
    ctx.db,
    { status, ...(isKind(query.kind) ? { kind: query.kind } : {}) },
    ctx.signal,
  )
  const timeZone = await townTimeZone(ctx.db, ctx.signal)
  const heldRuns = [
    ...new Set(rows.filter((r) => r.kind === 'owner_changed').map((r) => r.lastSeenRunId)),
  ]
  return (
    <main>
      <h1>Import exceptions</h1>
      <form method="get" className="my-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          Kind
          <select
            name="kind"
            defaultValue={query.kind ?? ''}
            className="mt-1 block rounded-md border bg-surface px-3 py-2"
          >
            <option value="">All kinds</option>
            {IMPORT_EXCEPTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Status
          <select
            name="status"
            defaultValue={status}
            className="mt-1 block rounded-md border bg-surface px-3 py-2"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      {heldRuns.map((runId) => (
        <ActionForm
          key={runId}
          action={acceptAllOwnerChangesAction}
          submitLabel="Accept all owner changes from this run"
          className="mb-4"
        >
          <input type="hidden" name="runId" value={runId} />
        </ActionForm>
      ))}
      {rows.length === 0 ? (
        <p>No exceptions match.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="py-4">
              <p className="font-semibold">{exceptionTitle(row.kind, row.rowKey)}</p>
              <p className="text-sm text-muted-foreground">
                {exceptionDetailText(row.detail, row.createdAt, timeZone)}
              </p>
              <ExceptionFacts payload={row.payload} />
              {row.status !== 'open' ? (
                <p className="text-sm">{`Status: ${row.status.replaceAll('_', ' ')}${row.dispositionReason === null ? '' : `. Reason: ${row.dispositionReason}`}`}</p>
              ) : (
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
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
