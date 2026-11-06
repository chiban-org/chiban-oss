import type { Metadata } from 'next'
import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { NEW_TAB } from '@/components/newTab'
import { NoPermission } from '@/components/staff/NoPermission'
import { type IncompleteRow, listPreservationIncomplete } from '@/features/preservation/preserve'
import { preservationReasonLabel } from '@/features/preservation/reasonCopy'
import { listPreservationRetrying, type RetryingRow } from '@/features/preservation/retryQueue'
import { documentRecordLinks } from '@/features/records/staffRecordLinks'
import { requireStaffContext } from '@/server/requireStaff'
import { retryPreservationAction } from '../actions'

export const metadata: Metadata = { title: 'Preservation' }

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

function tries(attempts: number): string {
  return `${attempts} ${attempts === 1 ? 'time' : 'times'}`
}

function DocumentCell({
  title,
  documentId,
  href,
}: {
  title: string
  documentId: string
  href: string | undefined
}) {
  return (
    <span className="flex flex-col">
      {href === undefined ? title : <Link href={href}>{title}</Link>}
      <a {...NEW_TAB} href={`/api/documents/${documentId}`} className="text-sm">
        Download the file
      </a>
    </span>
  )
}

function Problem({ row }: { row: IncompleteRow }) {
  return (
    <>
      {preservationReasonLabel(row.reason)}
      {row.detail === null || row.detail === '' ? null : (
        <details>
          <summary className="text-sm">Technical detail</summary>
          <pre className="whitespace-pre-wrap text-muted-foreground">{row.detail}</pre>
        </details>
      )}
    </>
  )
}

function IncompleteTable({
  rows,
  links,
}: {
  rows: IncompleteRow[]
  links: ReadonlyMap<string, string>
}) {
  return (
    <div className="table-panel">
      {rows.length === 0 ? (
        <p className="px-5 py-8">Every document that needs an archival copy has one.</p>
      ) : (
        <table className="w-full min-w-[44rem] text-left">
          <thead>
            <tr>
              <th scope="col">Document</th>
              <th scope="col">Problem</th>
              <th scope="col">Tries</th>
              <th scope="col">
                <span className="sr-only">Retry</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.recordId}>
                <td>
                  <DocumentCell
                    title={row.title}
                    documentId={row.documentId}
                    href={links.get(row.documentId)}
                  />
                </td>
                <td>
                  <Problem row={row} />
                </td>
                <td className="tabular-nums">{row.attempts}</td>
                <td>
                  <ActionForm action={retryPreservationAction} submitLabel="Retry">
                    <input type="hidden" name="recordId" value={row.recordId} />
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function RetryingList({
  rows,
  links,
}: {
  rows: RetryingRow[]
  links: ReadonlyMap<string, string>
}) {
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="retrying">
      <h2 id="retrying">Waiting to be tried again</h2>
      <p>These come back to the list above if the next try fails, or drop off once preserved.</p>
      <ul className="list-none space-y-1 p-0">
        {rows.map((row) => {
          const href = links.get(row.documentId)
          return (
            <li key={row.recordId}>
              {href === undefined ? row.title : <Link href={href}>{row.title}</Link>}
              {` (tried ${tries(row.attempts)} so far)`}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default async function PreservationQueuePage() {
  const ctx = await requireStaffContext()
  const queue = await listPreservationIncomplete(
    ctx.db,
    ctx.actor,
    { limit: PAGE_SIZE },
    ctx.signal,
  )
  if (!queue.ok) {
    return <NoPermission title="Preservation incomplete" action="see the preservation queue" />
  }
  const retrying = await listPreservationRetrying(ctx.db, ctx.actor, ctx.signal)
  const waiting = retrying.ok ? retrying.value : []
  const links = await documentRecordLinks(ctx.db, [
    ...queue.value.rows.map((r) => r.documentId),
    ...waiting.map((r) => r.documentId),
  ])
  return (
    <main data-wide="">
      <h1>Preservation incomplete</h1>
      <p>These documents have no archival copy yet. Fix the file or try again.</p>
      <IncompleteTable rows={queue.value.rows} links={links} />
      <RetryingList rows={waiting} links={links} />
    </main>
  )
}
