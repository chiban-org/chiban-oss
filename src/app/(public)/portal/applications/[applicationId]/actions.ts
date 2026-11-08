'use server'

import { z } from 'zod'
import type { Db } from '@/db/client'
import { loadApplicationContext } from '@/features/applications/context'
import { submitApplication } from '@/features/applications/submitApplication'
import { getVersion } from '@/features/config/store'
import type { FormBody } from '@/features/forms/formSchema'
import type { FieldError } from '@/features/forms/validateSubmission'
import type { GateResult } from '@/features/gates/evaluateGates'
import { inputField } from '@/features/input/field'
import { recordId } from '@/features/input/schemas'
import { saveDraftValues } from '@/features/portal/drafts'
import { fieldErrorCopy, rawValuesFromForm } from '@/features/portal/formData'
import { type ActionResult, errorCopy, text } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'
import { withPortalActor } from '@/server/portalAction'
import { err, ok } from '@/types/result'

const fail = (error: string): ActionResult => ({ ok: false, error })

async function formOf(
  db: Db,
  applicationId: string,
  signal: AbortSignal,
): Promise<FormBody | null> {
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return null
  return (await getVersion(db, app.pins.form, signal))?.body as FormBody
}

function withFieldErrors(errors: FieldError[]): ActionResult {
  return {
    ok: false,
    error: 'Check the highlighted fields and try again.',
    fieldErrors: Object.fromEntries(errors.map((e) => [e.field, fieldErrorCopy(e.code)])),
  }
}

function blockedCopy(results: GateResult[]): string {
  const reasons = results.flatMap((g) =>
    g.effective === 'blocked' && g.outcome.status !== 'pass' ? [g.outcome.reason] : [],
  )
  return `Not submitted. ${reasons.join(' ')}`
}

const SaveForm = z.object({ applicationId: recordId('an application') })

const SubmitForm = SaveForm.extend({
  attest: inputField((raw) =>
    raw === 'true' ? ok(true) : err('Check the box to confirm the information is true.'),
  ),
})

export async function saveDraftAction(formData: FormData): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(SaveForm, formData)
    if (!parsed.ok) return parsed.error
    const { applicationId } = parsed.value
    const form = await formOf(db, applicationId, signal)
    if (form === null) return fail(errorCopy('not_found'))
    const saved = await saveDraftValues(
      db,
      actor,
      { applicationId, values: rawValuesFromForm(formData, form) },
      signal,
    )
    if (saved.ok) return { ok: true, message: 'Draft saved.' }
    if (saved.error === 'not_found') return fail(errorCopy('not_found'))
    if (saved.error === 'not_draft') return fail('This application was already submitted.')
    return withFieldErrors(saved.error.fieldErrors)
  })
}

export async function submitApplicationAction(formData: FormData): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(SubmitForm, formData)
    if (!parsed.ok) return parsed.error
    const { applicationId } = parsed.value
    const form = await formOf(db, applicationId, signal)
    if (form === null) return fail(errorCopy('not_found'))
    const done = await submitApplication(
      db,
      actor,
      {
        applicationId,
        values: rawValuesFromForm(formData, form),
        attestation: { statementSha256: text(formData, 'attestationSha256') },
      },
      signal,
    )
    if (done.ok) return { ok: true, message: 'Application submitted.' }
    if (typeof done.error === 'string') return fail(errorCopy(done.error))
    if ('gateBlocked' in done.error) return fail(blockedCopy(done.error.gateBlocked))
    return withFieldErrors(done.error.fieldErrors)
  })
}
