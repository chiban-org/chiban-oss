'use server'

import { type CamaPreview, previewCamaFile } from '@/features/cama/previewCama'
import { runCamaImport } from '@/features/cama/runCamaImport'
import { saveCamaMapping } from '@/features/cama/saveMapping'
import type { ImportRunReport } from '@/features/gis/import/types'
import {
  type ActionResult,
  errorCopy,
  runStaffAction,
  runStaffValue,
  text,
} from '@/server/actionRunner'

const MAX_FILE_BYTES = 50 * 1024 * 1024

export type CamaPreviewResponse = { ok: true; preview: CamaPreview } | { ok: false; error: string }
export type CamaRunResponse =
  | { ok: true; message: string; runId: string }
  | { ok: false; error: string }

const COPY = {
  forbidden: errorCopy('forbidden'),
  invalid_mapping: 'The column mapping is not valid. Check every picker.',
  invalid_file: 'Choose a CSV file under 50 MB.',
  layer_not_configured: 'Save a column mapping first.',
  import_in_progress: 'Another CAMA import is running. Try again in a moment.',
  import_failed: 'The import failed. The details are on the Imports page.',
} as const

async function fileBytes(formData: FormData): Promise<Uint8Array | null> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_FILE_BYTES) return null
  return new Uint8Array(await file.arrayBuffer())
}

function mappingFrom(formData: FormData): unknown {
  try {
    return JSON.parse(text(formData, 'mapping')) as unknown
  } catch {
    return null
  }
}

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
  return `Imported ${r.countIn} rows: ${r.countApplied} filled or updated, ${r.countUnchanged} unchanged, ${r.countExcepted} sent to the exception queue (${held} owner changes held), ${missing} parcels missing from the file.`
}

export async function previewCamaAction(formData: FormData): Promise<CamaPreviewResponse> {
  const fail = (error: string): CamaPreviewResponse => ({ ok: false, error })
  return await runStaffValue(formData, fail, async ({ db, actor, signal }) => {
    const bytes = await fileBytes(formData)
    if (bytes === null) return fail(COPY.invalid_file)
    const result = await previewCamaFile(
      db,
      actor,
      { bytes, mapping: mappingFrom(formData) },
      signal,
    )
    return result.ok ? { ok: true, preview: result.value } : fail(describeError(result.error))
  })
}

export async function saveCamaMappingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const result = await saveCamaMapping(db, actor, mappingFrom(formData), signal)
    if (!result.ok) return { ok: false, error: COPY[result.error] }
    return { ok: true, message: 'Column mapping saved.' }
  })
}

export async function runCamaImportAction(formData: FormData): Promise<CamaRunResponse> {
  const fail = (error: string): CamaRunResponse => ({ ok: false, error })
  return await runStaffValue(formData, fail, async ({ db, actor, signal }) => {
    const bytes = await fileBytes(formData)
    if (bytes === null) return fail(COPY.invalid_file)
    const fullLayer = text(formData, 'fullLayer') === 'on'
    const result = await runCamaImport(db, actor, { bytes, fullLayer }, signal)
    if (!result.ok) return fail(describeError(result.error))
    return { ok: true, message: summary(result.value), runId: result.value.runId }
  })
}
