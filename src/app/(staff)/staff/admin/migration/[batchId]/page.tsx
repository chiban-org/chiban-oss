import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { DescriptionList } from '@/components/ui/description-list'
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

const ASK_PUBLISHER_COPY =
  'Review the files above, then ask a staff member who may publish documents to publish this batch. Until then every file in it stays private.'

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
    return <NoPermission title="Scanned property files" action="migrate scanned files" />
  }
  const { batch, report, exceptions } = loaded.value
  const staged = batch.status === 'staged'
  const mayPublish =
    staged && (await hasCapability(ctx.db, ctx.actor.userId, 'document.publish', ctx.signal))
  const rows: [string, number][] =
    report === null
      ? []
      : [
          ['Source files', report.source],
          ['Imported', report.imported],
          ['Duplicates linked', report.duplicateLinked],
          ['Set aside', report.excepted],
          ['Skipped', report.skipped],
          ['Text recognition failed', report.ocrFailed],
          ['Parcel not found', report.unresolvedParcel],
        ]
  return (
    <main>
      <SettingsHeader
        title={batch.name}
        lead={`${STATUS_COPY[batch.status]}.`}
        back={{ href: '/staff/admin/migration', label: 'Scanned property files' }}
      />
      <details className="text-sm">
        <summary className="cursor-pointer">Where the files came from</summary>
        <code>{batch.sourceRoot}</code>
      </details>
      {report === null ? <p>This batch has not been run yet.</p> : null}
      {report === null ? null : (
        <section aria-labelledby="report-heading">
          <h2 id="report-heading">Run report</h2>
          <DescriptionList
            labelWidth="wide"
            className="tabular-nums"
            items={rows.map(([label, value]) => ({ label, value }))}
          />
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
          <ul className="list-none space-y-3 p-0">
            {exceptions.map((item) => (
              <li key={item.id} className="record-item">
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
      {staged && !mayPublish ? <p role="note">{ASK_PUBLISHER_COPY}</p> : null}
    </main>
  )
}
