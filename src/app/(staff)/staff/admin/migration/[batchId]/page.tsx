import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { hasCapability } from '@/features/authz/capabilities'
import { loadBatchDetail } from '@/features/migration/batchQueries'
import { requireStaffContext } from '@/server/requireStaff'
import { publishMigrationBatchAction } from '../actions'
import { STATUS_COPY } from '../statusCopy'

export const dynamic = 'force-dynamic'

const REASON_COPY: Record<string, string> = {
  unparseable_folder: 'The folder name did not match the pattern',
  unsupported_type: 'The file type is not supported',
  read_error: 'The file could not be read or changed after the scan',
}

const OCR_COPY: Record<string, string> = {
  encrypted: 'The PDF is password protected',
  bad_input: 'The file could not be read as a scan',
  timeout: 'Text recognition took too long',
}

function itemProblems(item: {
  outcome: string | null
  exceptReason: string | null
  ocrStatus: string
  ocrReason: string | null
  parcelLink: string
}): string[] {
  const problems: string[] = []
  if (item.outcome === 'excepted') {
    problems.push(REASON_COPY[item.exceptReason ?? ''] ?? 'The file was set aside')
  }
  if (item.ocrStatus === 'failed') {
    problems.push(
      `Text recognition failed, the original is kept: ${OCR_COPY[item.ocrReason ?? ''] ?? 'the converter reported an error'}`,
    )
  }
  if (item.parcelLink === 'unresolved') problems.push('Parcel not found, the file stays private')
  return problems
}

export default async function MigrationBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const ctx = await requireStaffContext()
  const { batchId } = await params
  const loaded = await loadBatchDetail(ctx.db, ctx.actor, batchId, ctx.signal)
  if (!loaded.ok && loaded.error === 'not_found') notFound()
  if (!loaded.ok) {
    return (
      <main>
        <h1>Scanned property files</h1>
        <p role="alert">You do not have permission to migrate scanned files.</p>
      </main>
    )
  }
  const { batch, report, exceptions } = loaded.value
  const mayPublish =
    batch.status === 'staged' &&
    (await hasCapability(ctx.db, ctx.actor.userId, 'document.publish', ctx.signal))
  const rows: [string, number][] =
    report === null
      ? []
      : [
          ['Source files', report.source],
          ['Imported', report.imported],
          ['Duplicates linked', report.duplicateLinked],
          ['Set aside', report.excepted],
          ['Skipped', report.skipped],
          ['OCR failed', report.ocrFailed],
          ['Parcel not found', report.unresolvedParcel],
        ]
  return (
    <main>
      <h1>{batch.name}</h1>
      <p>
        {STATUS_COPY[batch.status]}. Source: <code>{batch.sourceRoot}</code>
      </p>
      {report === null ? <p>This batch has not been run yet.</p> : null}
      {report === null ? null : (
        <section aria-labelledby="report-heading">
          <h2 id="report-heading">Run report</h2>
          <p>Source files equal imported plus duplicates linked plus set aside plus skipped.</p>
          <dl className="m-0 grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt>{label}</dt>
                <dd className="m-0 text-right">{value}</dd>
              </div>
            ))}
          </dl>
          <h3>Set aside, by reason</h3>
          {Object.keys(report.exceptionsByReason).length === 0 ? <p>None.</p> : null}
          <ul>
            {Object.entries(report.exceptionsByReason).map(([reason, n]) => (
              <li key={reason}>
                {REASON_COPY[reason] ?? reason}: {n}
              </li>
            ))}
          </ul>
        </section>
      )}
      {exceptions.length === 0 ? null : (
        <section aria-labelledby="items-heading">
          <h2 id="items-heading">Files that need a look</h2>
          <ul className="m-0 list-none space-y-2 p-0">
            {exceptions.map((item) => (
              <li key={item.id} className="rounded-md border p-3">
                <p className="m-0 font-medium">{item.sourcePath}</p>
                {itemProblems(item).map((problem) => (
                  <p key={problem} className="m-0">
                    {problem}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      {mayPublish ? (
        <ActionForm
          action={publishMigrationBatchAction}
          submitLabel="Publish this batch"
          variant="default"
        >
          <input type="hidden" name="batchId" value={batch.id} />
          <p className="m-0">
            Files whose parcel was found become public. Files whose parcel was not found stay
            private.
          </p>
        </ActionForm>
      ) : null}
    </main>
  )
}
