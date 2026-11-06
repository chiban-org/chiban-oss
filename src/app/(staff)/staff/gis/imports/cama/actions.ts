'use server'

import { type CamaPreview, previewCamaFile } from '@/features/cama/previewCama'
import { runCamaImport } from '@/features/cama/runCamaImport'
import { saveCamaMapping } from '@/features/cama/saveMapping'
import type { ImportRunReport } from '@/features/gis/import/types'
import { type ActionResult, errorCopy, runStaffValue } from '@/server/actionRunner'
import { parseForm, refuseField, runStaffForm } from '@/server/formInput'
import { BAD_CAMA_MAPPING, CAMA_MAPPING_FORM, CAMA_PREVIEW_FORM, CAMA_RUN_FORM } from '../gisForms'

export type CamaPreviewResponse = { ok: true; preview: CamaPreview } | { ok: false; error: string }
export type CamaRunResponse =
  | { ok: true; message: string; runId: string }
  | { ok: false; error: string }

const COPY = {
  forbidden: errorCopy('forbidden'),
  invalid_mapping: BAD_CAMA_MAPPING,
  layer_not_configured: 'Save a column mapping first.',
  import_in_progress: 'Another CAMA import is running. Try again in a moment.',
  import_failed: 'The import failed. The details are on the Imports page.',
} as const

function describeError(error: unknown): string {
  if (typeof error === 'string')
    return error in COPY ? COPY[error as keyof typeof COPY] : errorCopy(error)
  const read = error as { kind?: string; detail?: string }
  return read.kind === 'malformed'
    ? `The file could not be read: ${read.detail ?? 'unknown problem'}.`
    : errorCopy('')
}

function summary(r: ImportRunReport): string {
  const held = r.exceptionsByKind.owner_changed ?? 0
  const missing = r.countMissingFromLayer
  return `Imported ${r.countIn} rows: ${r.countApplied} filled or updated, ${r.countUnchanged} unchanged, ${r.countExcepted} sent to the exception queue (${held} owner changes held), ${missing} parcels missing from the file. The column mapping used for this run is now the saved mapping.`
}

const bytesOf = async (file: File) => new Uint8Array(await file.arrayBuffer())

export async function previewCamaAction(formData: FormData): Promise<CamaPreviewResponse> {
  const fail = (error: string): CamaPreviewResponse => ({ ok: false, error })
  return await runStaffValue(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(CAMA_PREVIEW_FORM, formData)
    if (!parsed.ok) return fail(parsed.error.error)
    const result = await previewCamaFile(
      db,
      actor,
      { bytes: await bytesOf(parsed.value.file), mapping: parsed.value.mapping },
      signal,
    )
    return result.ok ? { ok: true, preview: result.value } : fail(describeError(result.error))
  })
}

export async function saveCamaMappingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, CAMA_MAPPING_FORM, async ({ db, actor, signal }, input) => {
    const result = await saveCamaMapping(db, actor, input.mapping, signal)
    if (result.ok) return { ok: true, message: 'Column mapping saved.' }
    return result.error === 'invalid_mapping'
      ? refuseField('mapping', COPY.invalid_mapping)
      : { ok: false, error: COPY[result.error] }
  })
}

export async function runCamaImportAction(formData: FormData): Promise<CamaRunResponse> {
  const fail = (error: string): CamaRunResponse => ({ ok: false, error })
  return await runStaffValue(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(CAMA_RUN_FORM, formData)
    if (!parsed.ok) return fail(parsed.error.error)
    const result = await runCamaImport(
      db,
      actor,
      {
        bytes: await bytesOf(parsed.value.file),
        fullLayer: parsed.value.fullLayer,
        mapping: parsed.value.mapping,
      },
      signal,
    )
    if (!result.ok) return fail(describeError(result.error))
    return { ok: true, message: summary(result.value), runId: result.value.runId }
  })
}
