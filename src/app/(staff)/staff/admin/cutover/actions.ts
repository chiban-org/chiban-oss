'use server'

import { cutoverErrorSentence } from '@/features/cutover/errorSentences'
import { importCutoverCsv } from '@/features/cutover/importCutover'
import { reconcileCutover, signOffReconciliation } from '@/features/cutover/reconcile'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'

const MAX_LISTED_ERRORS = 10
const MAX_FILE_BYTES = 10 * 1024 * 1024

async function fileBytes(formData: FormData): Promise<Uint8Array | null> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_FILE_BYTES) return null
  return new Uint8Array(await file.arrayBuffer())
}

const COPY = {
  forbidden: errorCopy('forbidden'),
  malformed:
    'The file could not be read. Download the template and keep the header row, including legacy_number, application_type_key, parcel_id, state, and received_date.',
} as const

export async function importCutoverAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const bytes = await fileBytes(formData)
    if (bytes === null) return { ok: false, error: 'Choose a CSV file under 10 MB.' }
    const dryRun = text(formData, 'mode') !== 'import'
    const result = await importCutoverCsv(db, actor, { bytes, dryRun }, signal)
    if (!result.ok) return { ok: false, error: COPY[result.error] }
    const { counts, rows } = result.value
    const problems = rows
      .filter((r) => r.outcome === 'error')
      .slice(0, MAX_LISTED_ERRORS)
      .map(
        (r) =>
          `Line ${r.line} (${r.legacyNumber}): ${r.errors.map(cutoverErrorSentence).join(' ')}`,
      )
    const head = `${dryRun ? 'Dry run, nothing saved' : 'Imported'}: ${counts.imported} ${dryRun ? 'would import' : 'imported'}, ${counts.alreadyImported} already imported, ${counts.errors} with errors.`
    return { ok: true, message: problems.length === 0 ? head : `${head} ${problems.join(' ')}` }
  })
}

export async function reconcileCutoverAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const bytes = await fileBytes(formData)
    if (bytes === null)
      return { ok: false, error: 'Choose the town list as a CSV file under 10 MB.' }
    const result = await reconcileCutover(db, actor, { listBytes: bytes }, signal)
    if (!result.ok) return { ok: false, error: COPY[result.error] }
    const r = result.value.report
    const missing = r.inListNotImported.slice(0, MAX_LISTED_ERRORS).join(', ')
    const extra = r.importedNotInList.slice(0, MAX_LISTED_ERRORS).join(', ')
    return {
      ok: true,
      message: `Reconciliation ${result.value.id}: ${r.inListAndImported.length} matched. On the list but not imported: ${missing === '' ? 'none' : missing}. Imported but not on the list: ${extra === '' ? 'none' : extra}.`,
    }
  })
}

export async function signOffReconciliationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const signed = await signOffReconciliation(
      db,
      actor,
      text(formData, 'reconciliationId'),
      signal,
    )
    if (!signed.ok) {
      return {
        ok: false,
        error: signed.error === 'forbidden' ? COPY.forbidden : errorCopy('not_found'),
      }
    }
    return { ok: true, message: 'Reconciliation signed off.' }
  })
}
