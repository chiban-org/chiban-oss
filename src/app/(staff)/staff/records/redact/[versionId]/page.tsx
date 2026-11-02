import { NH_RTK_EXEMPTIONS, OTHER_LAW_EXEMPTION_KEY } from '@packs/nh/rtkExemptions'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { BoxEditor } from '@/components/redaction/BoxEditor'
import { SelectField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { loadEditorSource } from '@/features/redaction/previewPages'
import { getObjectStore } from '@/features/storage/objectStore'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { requestRedactionAction } from '../actions'

export const dynamic = 'force-dynamic'

const EXEMPTIONS = [
  ...NH_RTK_EXEMPTIONS.map((e) => ({ key: e.key, label: `${e.citation.label}: ${e.label}` })),
  { key: OTHER_LAW_EXEMPTION_KEY, label: 'Made confidential by another law' },
]

export default async function RedactPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>
  searchParams: Promise<{ request?: string }>
}) {
  const { versionId } = await params
  const { request } = await searchParams
  if (!isUuid(versionId)) notFound()
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'redaction.create', ctx.signal))) {
    return <NoPermission title="Redact a document" action="redact documents" />
  }
  const source = await loadEditorSource(ctx.db, getObjectStore(), versionId, ctx.signal)
  if (!source.ok) {
    if (source.error === 'not_found') notFound()
    return (
      <main>
        <h1>Redact a document</h1>
        <p role="alert">
          {source.error === 'unsupported'
            ? 'Only PDF, JPEG, and PNG files can be redacted in Chiban.'
            : 'The file could not be opened. It may be damaged or password protected.'}
        </p>
      </main>
    )
  }
  const { documentId, title, mode, pages, truncated } = source.value
  const forRequest = request !== undefined && isUuid(request) ? request : undefined
  return (
    <main className="space-y-6">
      <h1>{`Redact: ${title}`}</h1>
      <p className="m-0">
        The original is never changed. Everything under each box is removed from a new copy, and
        nothing is public until you approve that copy.
      </p>
      {truncated ? (
        <p role="status">Only the first pages are shown. Redact the rest in a second pass.</p>
      ) : null}
      <ActionForm
        action={requestRedactionAction}
        submitLabel="Make the redacted copy"
        variant="default"
      >
        <input type="hidden" name="documentId" value={documentId} />
        <input type="hidden" name="sourceVersionId" value={versionId} />
        {forRequest === undefined ? null : (
          <input type="hidden" name="rtkRequestId" value={forRequest} />
        )}
        <SelectField
          label="The copy is for"
          name="purpose"
          defaultValue={forRequest === undefined ? 'public' : 'rtk_release'}
          options={[
            ['public', 'The public website'],
            ['rtk_release', 'A Right-to-Know request'],
          ]}
        />
        <BoxEditor pages={pages} exemptions={EXEMPTIONS} mode={mode} />
      </ActionForm>
    </main>
  )
}
