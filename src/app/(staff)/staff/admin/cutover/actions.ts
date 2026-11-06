'use server'

import { cutoverErrorSentence } from '@/features/cutover/errorSentences'
import { importCutoverCsv } from '@/features/cutover/importCutover'
import { reconcileCutover, signOffReconciliation } from '@/features/cutover/reconcile'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { IMPORT_FORM, RECONCILE_FORM, SIGN_OFF_FORM } from './forms'

const MAX_LISTED_ERRORS = 10

const TEMPLATE_COLUMNS = 'legacy_number, application_type_key, parcel_id, state, and received_date'

const IMPORT_COPY = {
  forbidden: errorCopy('forbidden'),
  malformed: 'The file could not be read. Save it as a CSV file and try again.',
  missing_columns: `The header row is missing columns. Download the template and keep the header row, including ${TEMPLATE_COLUMNS}.`,
  no_rows:
    'The file has a header row but no applications. Add one row per application below the header.',
} as const

const RECONCILE_COPY = {
  forbidden: errorCopy('forbidden'),
  malformed: 'The list could not be read. Save it as a CSV file and try again.',
  missing_legacy_number:
    'The list needs a column named legacy_number in its header row, with one legacy number per row.',
  no_rows: 'The list has a header row but no legacy numbers. Add one legacy number per row.',
} as const

const SIGN_OFF_COPY = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  already_signed_off: 'This comparison is already signed off.',
} as const

async function bytesOf(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

export async function importCutoverAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, IMPORT_FORM, async ({ db, actor, signal }, input) => {
    const dryRun = input.mode !== 'import'
    const result = await importCutoverCsv(
      db,
      actor,
      { bytes: await bytesOf(input.file), dryRun },
      signal,
    )
    if (!result.ok) {
      const copy = IMPORT_COPY[result.error]
      return result.error === 'forbidden' ? { ok: false, error: copy } : refuseField('file', copy)
    }
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
  return await runStaffForm(formData, RECONCILE_FORM, async ({ db, actor, signal }, input) => {
    const result = await reconcileCutover(
      db,
      actor,
      { listBytes: await bytesOf(input.file) },
      signal,
    )
    if (!result.ok) {
      const copy = RECONCILE_COPY[result.error]
      return result.error === 'forbidden' ? { ok: false, error: copy } : refuseField('file', copy)
    }
    const r = result.value.report
    const missing = r.inListNotImported.slice(0, MAX_LISTED_ERRORS).join(', ')
    const extra = r.importedNotInList.slice(0, MAX_LISTED_ERRORS).join(', ')
    return {
      ok: true,
      message: `Compared: ${r.inListAndImported.length} matched. On the list but not imported: ${missing === '' ? 'none' : missing}. Imported but not on the list: ${extra === '' ? 'none' : extra}.`,
    }
  })
}

export async function signOffReconciliationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    SIGN_OFF_FORM,
    async ({ db, actor, signal }, { reconciliationId }) => {
      const signed = await signOffReconciliation(db, actor, reconciliationId, signal)
      if (!signed.ok) return { ok: false, error: SIGN_OFF_COPY[signed.error] }
      return { ok: true, message: 'Reconciliation signed off.' }
    },
  )
}
