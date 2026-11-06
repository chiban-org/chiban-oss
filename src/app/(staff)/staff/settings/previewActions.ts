'use server'

import type { PreviewActionResult } from '@/components/config/WorkflowEditor'
import { saveDraft } from '@/features/config/store'
import { previewWorkflow } from '@/features/workflow/previewWorkflow'
import { errorCopy, runStaffValue } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'
import { refusedDraft } from './draftRefusal'
import { PREVIEW_WORKFLOW_FORM } from './forms'

export async function previewWorkflowAction(formData: FormData): Promise<PreviewActionResult> {
  return await runStaffValue<PreviewActionResult>(
    formData,
    (error) => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const parsed = parseForm(PREVIEW_WORKFLOW_FORM, formData)
      if (!parsed.ok) return parsed.error
      const input = parsed.value
      const saved = await saveDraft(
        db,
        actor,
        { kind: 'application_type', key: input.key, body: input.body },
        signal,
      )
      if (!saved.ok) return refusedDraft(saved.error)
      const shown = await previewWorkflow(
        db,
        actor,
        {
          versionId: saved.value.versionId,
          sampleFacts: {
            classification: null,
            dwellingUnits: null,
            afterTheFact: false,
            regionalImpact: input.previewRegionalImpact,
          },
          sampleDates: {
            received: input.previewReceived,
            ...(input.previewAccepted === null ? {} : { accepted: input.previewAccepted }),
            ...(input.previewMeeting === null ? {} : { meeting: input.previewMeeting }),
          },
        },
        signal,
      )
      if (!shown.ok) return { ok: false, error: errorCopy(shown.error) }
      return { ok: true, message: 'Preview updated. Nothing was published.', preview: shown.value }
    },
  )
}
