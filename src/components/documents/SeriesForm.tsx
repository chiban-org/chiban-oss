import { ActionForm } from '@/components/ActionForm'
import { SelectField } from '@/components/staff/fields'
import type { PanelDocument } from '@/features/documents/panelData'
import { loadPack } from '@/features/packs/loadPack'
import type { ActionResult } from '@/server/actionRunner'

function seriesOptions(current: string | null): [string, string][] {
  const listed = loadPack().recordSeries.map((s): [string, string] => [
    s.key,
    `${s.label} (${s.citation.label})`,
  ])
  return current === null ? [['', 'Choose a record series'], ...listed] : listed
}

export function SeriesForm({
  doc,
  action,
}: {
  doc: PanelDocument
  action: (formData: FormData) => Promise<ActionResult>
}) {
  const current = doc.series?.key ?? null
  return (
    <ActionForm action={action} submitLabel="Save record series">
      <input type="hidden" name="documentId" value={doc.documentId} />
      <SelectField
        label="Record series"
        name="seriesKey"
        hint="How long the town keeps this document follows its record series."
        defaultValue={current ?? ''}
        options={seriesOptions(current)}
        required
      />
    </ActionForm>
  )
}
