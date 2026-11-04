'use server'

import {
  asTemplateKind,
  listTemplateSamples,
  type PreviewResult,
  previewTemplate,
  type SamplesResult,
} from '@/features/templates/preview/templatePreview'
import { errorCopy, runStaffValue, text } from '@/server/actionRunner'

const PREVIEW_COPY: Record<string, string> = {
  not_found: 'That record cannot be shown with this kind of document.',
  unknown_fields: 'The letter uses merge fields that do not exist. Remove them and try again.',
}

export async function templateSamplesAction(formData: FormData): Promise<SamplesResult> {
  return await runStaffValue<SamplesResult>(
    formData,
    (error) => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const kind = asTemplateKind(text(formData, 'templateKind'))
      if (kind === null) return { ok: false, error: errorCopy('invalid_input') }
      const listed = await listTemplateSamples(db, actor, kind, signal)
      return listed.ok
        ? { ok: true, samples: listed.value }
        : { ok: false, error: errorCopy(listed.error) }
    },
  )
}

function parsedBody(formData: FormData): unknown {
  try {
    return JSON.parse(text(formData, 'body')) as unknown
  } catch {
    return undefined
  }
}

export async function templatePreviewAction(formData: FormData): Promise<PreviewResult> {
  return await runStaffValue<PreviewResult>(
    formData,
    (error) => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const shown = await previewTemplate(
        db,
        actor,
        { body: parsedBody(formData), recordId: text(formData, 'recordId') },
        signal,
      )
      if (shown.ok) return { ok: true, preview: shown.value }
      return { ok: false, error: PREVIEW_COPY[shown.error] ?? errorCopy(shown.error) }
    },
  )
}
