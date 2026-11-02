import { ActionForm } from '@/components/ActionForm'
import { listPreservationIncomplete } from '@/features/preservation/preserve'
import { preservationReasonLabel } from '@/features/preservation/reasonCopy'
import { requireStaffContext } from '@/server/requireStaff'
import { retryPreservationAction } from '../actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export default async function PreservationQueuePage() {
  const ctx = await requireStaffContext()
  const queue = await listPreservationIncomplete(
    ctx.db,
    ctx.actor,
    { limit: PAGE_SIZE },
    ctx.signal,
  )
  if (!queue.ok) {
    return (
      <main>
        <h1>Preservation incomplete</h1>
        <p role="alert">You do not have permission to view this queue.</p>
      </main>
    )
  }
  return (
    <main>
      <h1>Preservation incomplete</h1>
      <p>These documents have no archival copy yet. Fix the file or try again.</p>
      {queue.value.rows.length === 0 ? (
        <p>Every document that needs an archival copy has one.</p>
      ) : null}
      <ul className="space-y-3">
        {queue.value.rows.map((row) => (
          <li key={row.recordId} className="rounded-md border p-3">
            <a
              href={`/api/documents/${row.documentId}`}
              className="font-medium text-action underline"
            >
              {row.title}
            </a>
            <p className="m-0">{`Tried ${row.attempts} ${row.attempts === 1 ? 'time' : 'times'}. ${preservationReasonLabel(row.reason)}`}</p>
            {row.detail === null || row.detail === '' ? null : (
              <details>
                <summary className="cursor-pointer text-muted-foreground">Technical detail</summary>
                <pre className="whitespace-pre-wrap text-muted-foreground">{row.detail}</pre>
              </details>
            )}
            <ActionForm action={retryPreservationAction} submitLabel="Retry preservation">
              <input type="hidden" name="recordId" value={row.recordId} />
            </ActionForm>
          </li>
        ))}
      </ul>
    </main>
  )
}
